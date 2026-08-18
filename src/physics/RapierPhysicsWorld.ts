import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBodyWorld } from './RigidBodyWorld';
import type { ArticulationInspection, ColliderDefinition, InteractionQueryOptions, InteractionQueryResult, JointDefinition, PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition, RigidBodyState, Vector3Tuple } from './types';
import { Quaternion, Vector3 } from 'three';

await RAPIER.init();

const tuple = ({ x, y, z }: { x: number; y: number; z: number }): Vector3Tuple => [x, y, z];
const quaternion = (value: readonly number[] | undefined): Quaternion => new Quaternion(...(value ?? [0, 0, 0, 1]) as [number, number, number, number]);
const quaternionTuple = (value: Quaternion): [number, number, number, number] => [value.x, value.y, value.z, value.w];
interface MemberLocalPose { position: Vector3Tuple; orientation: [number, number, number, number] }

/** Rapier-backed fixed-timestep world. Stable authored IDs never expose engine handles. */
export class RapierPhysicsWorld implements RigidBodyWorld {
  private world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private definitions = new Map<string, RigidBodyDefinition>();
  private bodyByEntity = new Map<string, RAPIER.RigidBody>();
  private entityByBodyHandle = new Map<number, string>();
  private colliderById = new Map<string, RAPIER.Collider>();
  private colliderIdByHandle = new Map<number, string>();
  private memberByColliderId = new Map<string, string>();
  private memberLocalPoses = new Map<string, MemberLocalPose>();
  private jointDefinitions = new Map<string, JointDefinition>();
  private jointById = new Map<string, RAPIER.ImpulseJoint>();
  private queuedInputs = new Map<number, PhysicsInput[]>();
  private currentTick = 0;

  constructor(readonly ticksPerSecond = 60) {
    if (!Number.isInteger(ticksPerSecond) || ticksPerSecond <= 0) throw new Error('Physics ticks per second must be a positive integer.');
    this.world.timestep = 1 / ticksPerSecond;
    this.addGround();
  }

  get tick(): number { return this.currentTick; }

  private addGround(): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(100_000, 0.05, 100_000).setFriction(0.8), body);
  }

  private colliderDesc(collider: ColliderDefinition, mass: number): RAPIER.ColliderDesc {
    const [x, y, z] = collider.dimensions;
    const desc = collider.shape === 'ball'
      ? RAPIER.ColliderDesc.ball(Math.min(x, y, z) / 2)
      : collider.shape === 'cylinder'
        ? RAPIER.ColliderDesc.cylinder(y / 2, Math.min(x, z) / 2)
        : collider.shape === 'cone'
          ? RAPIER.ColliderDesc.cone(y / 2, Math.min(x, z) / 2)
        : collider.shape === 'capsule'
          ? RAPIER.ColliderDesc.capsule(Math.max(0, y / 2 - Math.min(x, z) / 2), Math.min(x, z) / 2)
          : RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
    desc.setTranslation(...collider.offset).setSensor(collider.sensor ?? false)
      .setFriction(collider.friction ?? 0.7).setRestitution(collider.restitution ?? 0);
    if (collider.sensor) desc.setDensity(0); else desc.setMass(mass);
    if (collider.orientation) desc.setRotation({ x: collider.orientation[0], y: collider.orientation[1], z: collider.orientation[2], w: collider.orientation[3] });
    if (collider.collisionGroups !== undefined) desc.setCollisionGroups(collider.collisionGroups);
    if (collider.solverGroups !== undefined) desc.setSolverGroups(collider.solverGroups);
    return desc;
  }

  reconcileDefinitions(next: readonly RigidBodyDefinition[], joints: readonly JointDefinition[] = []): void {
    // The overwhelmingly common reconciliation is an identical authored graph.
    // Avoid touching Rapier so handles, islands, warm-start impulses, and sleep state survive.
    if (structurallyEqual([...this.definitions.values()], next) && structurallyEqual([...this.jointDefinitions.values()], joints)) {
      // Kinematic definitions are authored poses, not retained simulation state. Inputs may
      // have moved them since the previous reconciliation, so refresh them even on a graph no-op.
      const refreshedEntities = new Set<string>();
      next.forEach((definition) => {
        const entityId = definition.entityId ?? definition.id;
        if ((definition.mode ?? 'dynamic') !== 'kinematic' || refreshedEntities.has(entityId)) return;
        refreshedEntities.add(entityId);
        const body = this.bodyByEntity.get(entityId); if (!body) return;
        const [x, y, z] = definition.position; const authoredRotation = rotation(definition.orientation ?? [0, 0, 0, 1]);
        body.setTranslation({ x, y, z }, false); body.setRotation(authoredRotation, false);
        body.setNextKinematicTranslation({ x, y, z }); body.setNextKinematicRotation(authoredRotation);
      });
      return;
    }
    const previous = this.frame().states;
    const previousDefinitions = this.definitions;
    const modes = new Map<string, Set<string>>();
    next.forEach((definition) => {
      const id = definition.entityId ?? definition.id;
      const set = modes.get(id) ?? new Set<string>();
      set.add(definition.mode ?? 'dynamic'); modes.set(id, set);
    });
    modes.forEach((set, id) => { if (set.size > 1) throw new Error(`Physics entity ${id} cannot mix rigid body modes.`); });

    this.world.free();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / this.ticksPerSecond;
    this.addGround();
    this.definitions = new Map(next.map((definition) => [definition.id, { ...definition }]));
    this.bodyByEntity.clear(); this.entityByBodyHandle.clear(); this.colliderById.clear();
    this.colliderIdByHandle.clear(); this.memberByColliderId.clear(); this.memberLocalPoses.clear();
    this.jointDefinitions = new Map(joints.map((joint) => [joint.id, { ...joint }]));
    this.jointById.clear();

    const groups = new Map<string, RigidBodyDefinition[]>();
    next.forEach((definition) => {
      const id = definition.entityId ?? definition.id;
      groups.set(id, [...(groups.get(id) ?? []), definition]);
    });
    groups.forEach((members, entityId) => {
      const anchor = members[0];
      const preserved = previous.get(anchor.id);
      const unchanged = previousDefinitions.get(anchor.id)?.revision === anchor.revision;
      const mode = anchor.mode ?? 'dynamic';
      // Authored kinematic cursor poses are resolved pre-variant input for every
      // reconciliation; only simulated dynamic/static state is preserved.
      const preservePose = preserved && unchanged && mode !== 'kinematic';
      const position = preservePose ? preserved.position : anchor.position;
      const orientation = preservePose ? preserved.orientation : (anchor.orientation ?? [0, 0, 0, 1]);
      const desc = mode === 'static' ? RAPIER.RigidBodyDesc.fixed() : mode === 'kinematic'
        ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic();
      desc.setTranslation(...position).setRotation({ x: orientation[0], y: orientation[1], z: orientation[2], w: orientation[3] })
        .setLinearDamping(anchor.linearDamping ?? 0).setGravityScale(anchor.gravityScale ?? 1)
        .setCcdEnabled(anchor.ccd ?? false).setCanSleep(anchor.canSleep ?? true);
      const body = this.world.createRigidBody(desc);
      if (preserved && unchanged) {
        body.setLinvel({ x: preserved.linearVelocity[0], y: preserved.linearVelocity[1], z: preserved.linearVelocity[2] }, false);
        body.setAngvel({ x: preserved.angularVelocity[0], y: preserved.angularVelocity[1], z: preserved.angularVelocity[2] }, false);
      }
      if (anchor.enabledTranslations) body.setEnabledTranslations(...anchor.enabledTranslations, false);
      if (anchor.enabledRotations) body.setEnabledRotations(...anchor.enabledRotations, false);
      this.bodyByEntity.set(entityId, body);
      this.entityByBodyHandle.set(body.handle, entityId);
      const mass = members.reduce((sum, member) => sum + (member.mass && member.mass > 0 ? member.mass : 1), 0);
      const massColliderCount = members.flatMap((member) => member.colliders ?? []).filter((collider) => !collider.sensor).length;
      const colliderMass = massColliderCount ? mass / massColliderCount : 0;
      const authoredAnchorOrientation = quaternion(anchor.orientation);
      const inverseAnchorOrientation = authoredAnchorOrientation.clone().invert();
      members.forEach((member) => {
        const worldOffset = new Vector3(...member.position).sub(new Vector3(...anchor.position));
        const localPosition = worldOffset.applyQuaternion(inverseAnchorOrientation);
        const localOrientation = inverseAnchorOrientation.clone().multiply(quaternion(member.orientation));
        const localPose: MemberLocalPose = { position: [localPosition.x, localPosition.y, localPosition.z], orientation: quaternionTuple(localOrientation) };
        this.memberLocalPoses.set(member.id, localPose);
        (member.colliders ?? []).forEach((collider) => {
          const colliderOffset = new Vector3(...collider.offset).applyQuaternion(localOrientation).add(localPosition);
          const colliderOrientation = localOrientation.clone().multiply(quaternion(collider.orientation));
          const compiled = this.world.createCollider(this.colliderDesc({
            ...collider,
            offset: [colliderOffset.x, colliderOffset.y, colliderOffset.z],
            orientation: quaternionTuple(colliderOrientation),
          }, colliderMass), body);
          this.colliderById.set(collider.id, compiled);
          this.colliderIdByHandle.set(compiled.handle, collider.id);
          this.memberByColliderId.set(collider.id, member.id);
        });
      });
      if (mode === 'dynamic' && massColliderCount === 0) body.setAdditionalMass(mass, false);
    });
    joints.forEach((definition) => {
      const parent = this.bodyByEntity.get(definition.parentEntityId);
      const child = this.bodyByEntity.get(definition.childEntityId);
      if (!parent || !child) throw new Error(`Joint ${definition.id} references a missing rigid body.`);
      const a = { x: definition.parentAnchor[0], y: definition.parentAnchor[1], z: definition.parentAnchor[2] };
      const b = { x: definition.childAnchor[0], y: definition.childAnchor[1], z: definition.childAnchor[2] };
      const data = definition.kind === 'revolute'
        ? RAPIER.JointData.revoluteWithAxes(a, b, vector(definition.parentAxis), vector(definition.childAxis))
        : definition.kind === 'prismatic'
          ? RAPIER.JointData.prismatic(a, b, vector(definition.parentAxis))
          : definition.kind === 'fixed'
            ? RAPIER.JointData.fixed(a, rotation(definition.parentFrame), b, rotation(definition.childFrame))
            : RAPIER.JointData.spherical(a, b);
      const joint = this.world.createImpulseJoint(data, parent, child, true);
      joint.setContactsEnabled(definition.collideConnected ?? false);
      if (definition.kind === 'revolute') {
        const revolute = joint as RAPIER.RevoluteImpulseJoint;
        if (definition.limits) revolute.setLimits(...definition.limits);
        if (definition.damping && definition.damping > 0) revolute.configureMotorVelocity(0, definition.damping);
      } else if (definition.kind === 'prismatic') {
        const prismatic = joint as RAPIER.PrismaticImpulseJoint;
        if (definition.limits) prismatic.setLimits(...definition.limits);
        if (definition.damping && definition.damping > 0) prismatic.configureMotorVelocity(0, definition.damping);
      }
      this.jointById.set(definition.id, joint);
    });
  }

  enqueueInputs(inputs: readonly PhysicsInput[]): void {
    inputs.forEach((input) => {
      if (!Number.isInteger(input.tick) || input.tick <= this.currentTick) throw new Error(`Physics input tick ${input.tick} must be after current tick ${this.currentTick}.`);
      this.queuedInputs.set(input.tick, [...(this.queuedInputs.get(input.tick) ?? []), input]);
    });
  }

  private bodyFor(id: string): RAPIER.RigidBody | undefined {
    const definition = this.definitions.get(id);
    return definition && this.bodyByEntity.get(definition.entityId ?? definition.id);
  }

  step(targetTick = this.currentTick + 1): PhysicsFrame {
    if (!Number.isInteger(targetTick) || targetTick < this.currentTick) throw new Error('Physics cannot step backward; restore a snapshot before replaying.');
    while (this.currentTick < targetTick) {
      const tick = this.currentTick + 1;
      [...(this.queuedInputs.get(tick) ?? [])].sort((a, b) => (a.stableSourceOrder ?? 0) - (b.stableSourceOrder ?? 0)).forEach((input) => {
        const body = this.bodyFor(input.bodyId); if (!body) return;
        if (input.kind === 'force') body.addForce({ x: input.vector[0], y: input.vector[1], z: input.vector[2] }, true);
        else if (input.kind === 'impulse') body.applyImpulse({ x: input.vector[0], y: input.vector[1], z: input.vector[2] }, true);
        else if (input.kind === 'translation') { const p = body.translation(); body.setTranslation({ x: p.x + input.vector[0], y: p.y + input.vector[1], z: p.z + input.vector[2] }, true); }
        else if (input.kind === 'orientation') body.setRotation({ x: input.orientation[0], y: input.orientation[1], z: input.orientation[2], w: input.orientation[3] }, true);
        else if ('position' in input) {
          const localPose = this.memberLocalPoses.get(input.bodyId) ?? { position: [0, 0, 0] as Vector3Tuple, orientation: [0, 0, 0, 1] as [number, number, number, number] };
          const offset = new Vector3(...localPose.position).applyQuaternion(quaternionTupleToThree(body.rotation()));
          const target = { x: input.position[0] - offset.x, y: input.position[1] - offset.y, z: input.position[2] - offset.z };
          if (input.kind === 'kinematic-target') body.setNextKinematicTranslation(target); else body.setTranslation(target, true);
          if (input.kind === 'teleport' && input.clearVelocity) { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
        }
      });
      this.world.step(); this.queuedInputs.delete(tick); this.currentTick = tick;
    }
    return this.frame();
  }

  frame(): PhysicsFrame {
    const states = new Map<string, RigidBodyState>();
    this.definitions.forEach((definition, id) => {
      // Cursor sensors are authored per transaction frame. Publishing them as
      // retained simulation state would overwrite the next authored cursor pose.
      if (definition.retainsPhysicsState === false) return;
      const body = this.bodyFor(id); if (!body) return;
      const p = tuple(body.translation()); const localPose = this.memberLocalPoses.get(id) ?? { position: [0, 0, 0] as Vector3Tuple, orientation: [0, 0, 0, 1] as [number, number, number, number] };
      const bodyOrientation = quaternionTupleToThree(body.rotation());
      const offset = new Vector3(...localPose.position).applyQuaternion(bodyOrientation);
      const orientation = bodyOrientation.clone().multiply(quaternion(localPose.orientation));
      states.set(id, { id, position: [p[0] + offset.x, p[1] + offset.y, p[2] + offset.z],
        orientation: quaternionTuple(orientation), linearVelocity: tuple(body.linvel()), angularVelocity: tuple(body.angvel()), sleeping: body.isSleeping(), tick: this.currentTick });
    });
    return { tick: this.currentTick, states };
  }

  /**
   * Geometry query for post-step poses at `tick`. It only reads Rapier and is safe
   * to call repeatedly. Shape distance is authoritative: negative distance is a
   * breach, while [0, tolerance] is a geometry-aware face/edge/corner touch.
   */
  queryInteractions(options: InteractionQueryOptions = {}): readonly InteractionQueryResult[] {
    const tolerance = Math.max(0, options.tolerance ?? 0.001);
    const definitions = [...this.definitions.values()];
    const cursorColliders = definitions.flatMap((definition) => (definition.colliders ?? [])
      .filter(({ interactionRole }) => interactionRole === 'cursor').map((collider) => ({ definition, collider })));
    const targetColliders = definitions.flatMap((definition) => (definition.colliders ?? [])
      .filter(({ interactionRole }) => interactionRole === 'target').map((collider) => ({ definition, collider })));
    const offsets: Vector3Tuple[] = options.periodicSpace
      ? [-options.periodicSpace.width, 0, options.periodicSpace.width].flatMap((x) =>
          [-options.periodicSpace!.depth, 0, options.periodicSpace!.depth].map((z): Vector3Tuple => [x, 0, z]))
      : [[0, 0, 0]];
    const candidates: InteractionQueryResult[] = [];

    cursorColliders.forEach((cursorEntry) => targetColliders.forEach((targetEntry) => {
      if (cursorEntry.definition.id === targetEntry.definition.id) return;
      if (!groupsCompatible(cursorEntry.collider.collisionGroups, targetEntry.collider.collisionGroups)) return;
      const cursor = this.colliderById.get(cursorEntry.collider.id);
      const target = this.colliderById.get(targetEntry.collider.id);
      if (!cursor || !target) return;
      let best: InteractionQueryResult | undefined;
      offsets.forEach(([x, y, z]) => {
        const cursorPosition = cursor.translation();
        const shifted = { x: cursorPosition.x + x, y: cursorPosition.y + y, z: cursorPosition.z + z };
        const numericalSlop = 1e-5;
        const centralImage = x === 0 && y === 0 && z === 0;
        const contact = centralImage
          ? target.contactCollider(cursor, tolerance + numericalSlop)
          : target.contactShape(cursor.shape, shifted, cursor.rotation(), tolerance + numericalSlop);
        if (!contact) return;
        if (contact.distance > tolerance + numericalSlop) return;
        let geometricDistance = contact.distance;
        let geometricNormal = tuple(contact.normal2);
        // Solver colliders expose all contact manifolds. Prefer their deepest
        // contact and world normal; shape-contact remains the proximity query for
        // separated pairs and for sensors, which intentionally have no manifold.
        if (centralImage && !cursor.isSensor() && !target.isSensor()) {
          this.world.contactPair(target, cursor, (manifold, flipped) => {
            for (let i = 0; i < manifold.numContacts(); i += 1) {
              const distance = manifold.contactDist(i);
              if (distance > geometricDistance) continue;
              const n = manifold.normal();
              const sign = flipped ? 1 : -1;
              geometricDistance = distance;
              geometricNormal = [n.x * sign, n.y * sign, n.z * sign];
            }
          });
        }
        // Rapier's sensor intersection graph establishes positive overlap for the
        // ordinary image. Periodic images use the same exact-shape intersection.
        let intersects = cursor.isSensor() && centralImage
          ? false : target.shape.intersectsShape(target.translation(), target.rotation(), cursor.shape, shifted, cursor.rotation());
        if (cursor.isSensor() && centralImage) {
          this.world.intersectionPairsWith(cursor, (other) => { if (other.handle === target.handle) intersects = true; });
        }
        const penetration = geometricDistance < -1e-7 ? -geometricDistance : intersects && geometricDistance < 0 ? -geometricDistance : 0;
        const state = penetration > 0 ? 'breach' as const : 'touch' as const;
        const normal = geometricNormal;
        const targetPosition = target.translation();
        const inferredDirection: Vector3Tuple = [
          targetPosition.x < shifted.x ? -1 : 1,
          targetPosition.y < shifted.y ? -1 : 1,
          targetPosition.z < shifted.z ? -1 : 1,
        ];
        const targetIdentity = targetEntry.definition.interactionIdentity ?? { id: targetEntry.definition.id, namespace: '' };
        const rawCursorIdentity = cursorEntry.definition.interactionIdentity ?? { id: cursorEntry.definition.id, namespace: cursorEntry.definition.id };
        const cursorIdentity = { ...rawCursorIdentity, streamId: rawCursorIdentity.streamId ?? 'secondary' };
        const result: InteractionQueryResult = {
          tick: this.currentTick, state, target: { ...targetIdentity }, cursor: cursorIdentity,
          targetColliderId: targetEntry.collider.id, cursorColliderId: cursorEntry.collider.id,
          normal, inferredDirection,
          ...(state === 'breach' ? { penetration, resolutionDistance: penetration } : { separation: Math.max(0, geometricDistance) }),
        };
        if (!best || compareRepresentative(result, best) < 0) best = result;
      });
      if (best) candidates.push(best);
    }));

    const logical = new Map<string, InteractionQueryResult>();
    candidates.forEach((candidate) => {
      const key = `${candidate.cursor.streamId}\0${candidate.cursor.namespace}\0${candidate.cursor.id}\0${candidate.target.namespace}\0${candidate.target.id}`;
      const current = logical.get(key);
      if (!current || compareRepresentative(candidate, current) < 0) logical.set(key, candidate);
    });
    return Object.freeze([...logical.values()].sort((a, b) =>
      a.cursor.streamId.localeCompare(b.cursor.streamId) || a.cursor.namespace.localeCompare(b.cursor.namespace) ||
      a.cursor.id.localeCompare(b.cursor.id) || a.target.namespace.localeCompare(b.target.namespace) || a.target.id.localeCompare(b.target.id))
      .map((result) => Object.freeze(result)));
  }

  inspectArticulations(): readonly ArticulationInspection[] {
    return [...this.jointDefinitions.values()].map((definition) => {
      const joint = this.jointById.get(definition.id);
      const parent = this.bodyByEntity.get(definition.parentEntityId); const child = this.bodyByEntity.get(definition.childEntityId);
      let coordinate: number | undefined;
      if (joint && parent && child && definition.kind === 'prismatic') {
        const axis = new Vector3(...definition.parentAxis).applyQuaternion(quaternionTupleToThree(parent.rotation())).normalize();
        const pa = new Vector3(...definition.parentAnchor).applyQuaternion(quaternionTupleToThree(parent.rotation())).add(new Vector3(...tuple(parent.translation())));
        const pb = new Vector3(...definition.childAnchor).applyQuaternion(quaternionTupleToThree(child.rotation())).add(new Vector3(...tuple(child.translation())));
        coordinate = pb.sub(pa).dot(axis);
      } else if (joint && parent && child && definition.kind === 'revolute') {
        const relative = quaternionTupleToThree(parent.rotation()).invert().multiply(quaternionTupleToThree(child.rotation())).normalize();
        coordinate = 2 * Math.atan2(new Vector3(relative.x, relative.y, relative.z).dot(new Vector3(...definition.parentAxis).normalize()), relative.w);
      }
      let pivotError: number | undefined;
      if (parent && child) {
        const pa = new Vector3(...definition.parentAnchor).applyQuaternion(quaternionTupleToThree(parent.rotation())).add(new Vector3(...tuple(parent.translation())));
        const pb = new Vector3(...definition.childAnchor).applyQuaternion(quaternionTupleToThree(child.rotation())).add(new Vector3(...tuple(child.translation())));
        pivotError = pa.distanceTo(pb);
      }
      return { id: definition.id, parentEntityId: definition.parentEntityId, childEntityId: definition.childEntityId,
        kind: definition.kind, coordinate, limits: 'limits' in definition ? definition.limits : undefined, pivotError };
    });
  }
  snapshot(): PhysicsSnapshot { return structuredClone({ schemaVersion: 1 as const, backend: 'rapier-0.20', tick: this.currentTick, states: [...this.frame().states.values()], definitions: [...this.definitions.values()], joints: [...this.jointDefinitions.values()] }); }
  restore(snapshot: PhysicsSnapshot): void {
    this.definitions.clear();
    this.reconcileDefinitions(snapshot.definitions, snapshot.joints ?? []);
    const states = new Map(snapshot.states.map((state) => [state.id, state]));
    const restoredEntities = new Set<string>();
    snapshot.definitions.forEach((definition) => {
      const entityId = definition.entityId ?? definition.id;
      if (restoredEntities.has(entityId)) return;
      restoredEntities.add(entityId);
      const state = states.get(definition.id); const body = this.bodyByEntity.get(entityId);
      if (!state || !body) return;
      const localPose = this.memberLocalPoses.get(definition.id) ?? { position: [0, 0, 0] as Vector3Tuple, orientation: [0, 0, 0, 1] as [number, number, number, number] };
      const bodyOrientation = quaternion(state.orientation).multiply(quaternion(localPose.orientation).invert());
      const offset = new Vector3(...localPose.position).applyQuaternion(bodyOrientation);
      body.setTranslation({ x: state.position[0] - offset.x, y: state.position[1] - offset.y, z: state.position[2] - offset.z }, false);
      body.setRotation(bodyOrientation, false);
      body.setLinvel({ x: state.linearVelocity[0], y: state.linearVelocity[1], z: state.linearVelocity[2] }, false);
      body.setAngvel({ x: state.angularVelocity[0], y: state.angularVelocity[1], z: state.angularVelocity[2] }, false);
      if (state.sleeping) body.sleep();
    });
    this.currentTick = snapshot.tick;
    this.queuedInputs.clear();
  }
  dispose(): void { this.world.free(); this.definitions.clear(); this.bodyByEntity.clear(); this.entityByBodyHandle.clear();
    this.colliderById.clear(); this.colliderIdByHandle.clear(); this.memberByColliderId.clear(); this.memberLocalPoses.clear(); this.jointDefinitions.clear(); this.jointById.clear(); this.queuedInputs.clear(); }
}

function groupsCompatible(a = 0xffffffff, b = 0xffffffff): boolean {
  const aMembership = a >>> 16; const aFilter = a & 0xffff;
  const bMembership = b >>> 16; const bFilter = b & 0xffff;
  return (aMembership & bFilter) !== 0 && (bMembership & aFilter) !== 0;
}

function compareRepresentative(a: InteractionQueryResult, b: InteractionQueryResult): number {
  if (a.state !== b.state) return a.state === 'breach' ? -1 : 1;
  if (a.state === 'breach') {
    const depth = (b.penetration ?? 0) - (a.penetration ?? 0);
    if (depth) return depth;
  } else {
    const distance = (a.separation ?? Infinity) - (b.separation ?? Infinity);
    if (distance) return distance;
  }
  return a.targetColliderId.localeCompare(b.targetColliderId) || a.cursorColliderId.localeCompare(b.cursorColliderId);
}

function quaternionTupleToThree(value: { x: number; y: number; z: number; w: number }): Quaternion {
  return new Quaternion(value.x, value.y, value.z, value.w);
}

function vector(value: Vector3Tuple): { x: number; y: number; z: number } { return { x: value[0], y: value[1], z: value[2] }; }
function rotation(value: readonly number[]): { x: number; y: number; z: number; w: number } { return { x: value[0], y: value[1], z: value[2], w: value[3] }; }
function structurallyEqual(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
