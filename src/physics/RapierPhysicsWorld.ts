import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBodyWorld } from './RigidBodyWorld';
import type { ColliderDefinition, PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition, RigidBodyState, Vector3Tuple } from './types';

await RAPIER.init();

const tuple = ({ x, y, z }: { x: number; y: number; z: number }): Vector3Tuple => [x, y, z];

/** Rapier-backed fixed-timestep world. Stable authored IDs never expose engine handles. */
export class RapierPhysicsWorld implements RigidBodyWorld {
  private world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private definitions = new Map<string, RigidBodyDefinition>();
  private bodyByEntity = new Map<string, RAPIER.RigidBody>();
  private memberOffsets = new Map<string, Vector3Tuple>();
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

  private colliderDesc(collider: ColliderDefinition): RAPIER.ColliderDesc {
    const [x, y, z] = collider.dimensions;
    const desc = collider.shape === 'ball'
      ? RAPIER.ColliderDesc.ball(Math.min(x, y, z) / 2)
      : collider.shape === 'cylinder'
        ? RAPIER.ColliderDesc.cylinder(y / 2, Math.min(x, z) / 2)
        : collider.shape === 'capsule'
          ? RAPIER.ColliderDesc.capsule(Math.max(0, y / 2 - Math.min(x, z) / 2), Math.min(x, z) / 2)
          : RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
    desc.setTranslation(...collider.offset).setSensor(collider.sensor ?? false)
      .setFriction(collider.friction ?? 0.7).setRestitution(collider.restitution ?? 0);
    if (collider.orientation) desc.setRotation({ x: collider.orientation[0], y: collider.orientation[1], z: collider.orientation[2], w: collider.orientation[3] });
    if (collider.collisionGroups !== undefined) desc.setCollisionGroups(collider.collisionGroups);
    if (collider.solverGroups !== undefined) desc.setSolverGroups(collider.solverGroups);
    return desc;
  }

  reconcileDefinitions(next: readonly RigidBodyDefinition[]): void {
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
    this.bodyByEntity.clear(); this.memberOffsets.clear();

    const groups = new Map<string, RigidBodyDefinition[]>();
    next.forEach((definition) => {
      const id = definition.entityId ?? definition.id;
      groups.set(id, [...(groups.get(id) ?? []), definition]);
    });
    groups.forEach((members, entityId) => {
      const anchor = members[0];
      const preserved = previous.get(anchor.id);
      const unchanged = previousDefinitions.get(anchor.id)?.revision === anchor.revision;
      const position = preserved && unchanged ? preserved.position : anchor.position;
      const orientation = preserved && unchanged ? preserved.orientation : (anchor.orientation ?? [0, 0, 0, 1]);
      const mode = anchor.mode ?? 'dynamic';
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
      members.forEach((member) => {
        const offset = member.position.map((value, axis) => value - anchor.position[axis]) as Vector3Tuple;
        this.memberOffsets.set(member.id, offset);
        (member.colliders ?? []).forEach((collider) => {
          this.world.createCollider(this.colliderDesc({ ...collider, offset: collider.offset.map((value, axis) => value + offset[axis]) as Vector3Tuple }), body);
        });
      });
      const mass = members.reduce((sum, member) => sum + (member.mass && member.mass > 0 ? member.mass : 1), 0);
      if (mode === 'dynamic') body.setAdditionalMass(mass, false);
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
        else if ('position' in input) {
          const offset = this.memberOffsets.get(input.bodyId) ?? [0, 0, 0];
          const target = { x: input.position[0] - offset[0], y: input.position[1] - offset[1], z: input.position[2] - offset[2] };
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
      const body = this.bodyFor(id); if (!body) return;
      const p = tuple(body.translation()); const offset = this.memberOffsets.get(id) ?? [0, 0, 0];
      const q = body.rotation();
      states.set(id, { id, position: p.map((value, axis) => value + offset[axis]) as Vector3Tuple,
        orientation: [q.x, q.y, q.z, q.w], linearVelocity: tuple(body.linvel()), angularVelocity: tuple(body.angvel()), sleeping: body.isSleeping(), tick: this.currentTick });
    });
    return { tick: this.currentTick, states };
  }

  snapshot(): PhysicsSnapshot { return { schemaVersion: 1, backend: 'rapier-0.20', tick: this.currentTick, states: [...this.frame().states.values()], definitions: [...this.definitions.values()] }; }
  restore(snapshot: PhysicsSnapshot): void {
    this.definitions.clear();
    this.reconcileDefinitions(snapshot.definitions);
    const states = new Map(snapshot.states.map((state) => [state.id, state]));
    const restoredEntities = new Set<string>();
    snapshot.definitions.forEach((definition) => {
      const entityId = definition.entityId ?? definition.id;
      if (restoredEntities.has(entityId)) return;
      restoredEntities.add(entityId);
      const state = states.get(definition.id); const body = this.bodyByEntity.get(entityId);
      if (!state || !body) return;
      const offset = this.memberOffsets.get(definition.id) ?? [0, 0, 0];
      body.setTranslation({ x: state.position[0] - offset[0], y: state.position[1] - offset[1], z: state.position[2] - offset[2] }, false);
      body.setRotation({ x: state.orientation[0], y: state.orientation[1], z: state.orientation[2], w: state.orientation[3] }, false);
      body.setLinvel({ x: state.linearVelocity[0], y: state.linearVelocity[1], z: state.linearVelocity[2] }, false);
      body.setAngvel({ x: state.angularVelocity[0], y: state.angularVelocity[1], z: state.angularVelocity[2] }, false);
      if (state.sleeping) body.sleep();
    });
    this.currentTick = snapshot.tick;
    this.queuedInputs.clear();
  }
  dispose(): void { this.world.free(); this.definitions.clear(); this.bodyByEntity.clear(); this.queuedInputs.clear(); }
}
