import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { ColliderDefinition, ColliderShape, JointDefinition, RigidBodyDefinition, Vector3Tuple } from './types';
import { Euler, Quaternion, Vector3 } from 'three';
import { authoredPhysicsEntityId, physicsOriginScope, scopedPhysicsNamespace } from './physicsIdentity';
import { composeTransforms, identityTransform } from '../model/transform';

export interface CompiledPhysicsScene { bodies: RigidBodyDefinition[]; joints: JointDefinition[] }

/** Returns the exact stable entity identity attached to a rendered Three.js primitive. */
export function physicsEntityIdForNode(document: SpatialDocument, node: SpatialNode): string {
  let baseId = authoredPhysicsEntityId(node);
  document.csgExpressions.forEach((expression) => {
    if (expression.base.id === node.id || (expression.operations.some(({ tool }) => tool.id === node.id)
      && physicsOriginScope(node) === physicsOriginScope(expression.base))) baseId = authoredPhysicsEntityId(expression.base);
  });
  return node.origin?.sourceKind === 'secondary'
    ? `${baseId}:${node.physics?.['physical-body'] === true ? 'physical' : 'cursor-sensor'}`
    : baseId;
}

function flatten(nodes: readonly SpatialNode[]): SpatialNode[] {
  return nodes.flatMap((node) => [node.renderable ? node : undefined, ...flatten(node.children ?? [])])
    .filter(Boolean) as SpatialNode[];
}

function colliderShape(node: SpatialNode): ColliderShape {
  switch (node.geometry.kind) {
    case 'sphere': return 'ball';
    case 'cylinder': return 'cylinder';
    case 'cone': return 'cone';
    default: return 'cuboid';
  }
}

/** Converts renderer-neutral nodes into stable compound rigid-body definitions. */
export function compilePhysicsScene(document: SpatialDocument, revision = 'baseline'): RigidBodyDefinition[] {
  return compileArticulatedPhysicsScene(document, revision).bodies;
}

export function compileArticulatedPhysicsScene(document: SpatialDocument, revision = 'baseline'): CompiledPhysicsScene {
  const diagnose = (diagnostic: SpatialDocument['diagnostics'][number]) => {
    if (!document.diagnostics.some(({ line, source, message }) => line === diagnostic.line && source === diagnostic.source && message === diagnostic.message)) {
      document.diagnostics.push(diagnostic);
    }
  };
  // All secondary primitives are compiled: ordinary cursors are zero-mass sensors,
  // while the explicit physical-body opt-in retains ordinary rigid-body semantics.
  const candidates = flatten(document.nodes);
  const hierarchyParent = new Map<SpatialNode, SpatialNode>();
  const indexHierarchy = (nodes: readonly SpatialNode[], parent?: SpatialNode) => nodes.forEach((entry) => {
    if (parent) hierarchyParent.set(entry, parent);
    indexHierarchy(entry.children ?? [], entry);
  });
  indexHierarchy(document.nodes);
  // Articulation is authored in the immutable coordinate system of the
  // materialized top-level component.  Never use a published/render transform
  // here: it may contain a pose supplied by PhysicsFrame.
  const componentRoots = document.nodes;
  const componentRootFor = (node: SpatialNode): SpatialNode | undefined => {
    const component = node.namespacePath?.split('/').filter(Boolean)[0];
    return componentRoots.find((root) => root.namespacePath?.split('/').filter(Boolean)[0] === component
      && physicsOriginScope(root) === physicsOriginScope(node));
  };
  const componentPoseFor = (node: SpatialNode) => {
    const root = componentRootFor(node);
    if (!root) return node.localTransform ?? node.transform;
    const chain: SpatialNode[] = [];
    let current: SpatialNode | undefined = node;
    while (current && current !== root) {
      chain.unshift(current);
      current = hierarchyParent.get(current);
    }
    // A materialized ref-scale is part of the instance's authored coordinate
    // mapping. Keep its scale while deliberately excluding root translation and
    // rotation, which only place the complete articulation in world space.
    const pose = identityTransform();
    pose.scale = [...(root.localTransform?.scale ?? [1, 1, 1])];
    return chain.reduce((result, entry) => composeTransforms(result, entry.localTransform ?? entry.transform), pose);
  };
  const componentScaleFor = (node: SpatialNode): Vector3Tuple =>
    [...(componentRootFor(node)?.localTransform?.scale ?? [1, 1, 1])] as Vector3Tuple;
  const physicsEntityId = (node: SpatialNode): string => physicsEntityIdForNode(document, node);
  const modeByEntity = new Map<string, NonNullable<RigidBodyDefinition['mode']>>();
  candidates.forEach((node) => {
    const id = physicsEntityId(node);
    const mode = node.origin?.sourceKind === 'secondary' && node.physics?.['physical-body'] !== true
      ? 'kinematic' : (node.physics?.['physics-mode'] ?? 'dynamic');
    const established = modeByEntity.get(id);
    if (!established) modeByEntity.set(id, mode);
    else if (established !== mode) diagnose({
      line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
      message: `Conflicting physics-mode "${mode}" in compound "${id}"; using first mode "${established}".`,
    });
  });

  const bodies = candidates.map((node, entityOrder): RigidBodyDefinition => {
      const transform = node.worldTransform ?? node.transform;
      const physics = node.physics ?? { diagnostics: [] };
      const cursor = node.origin?.sourceKind === 'secondary';
      const physicalCursor = cursor && physics['physical-body'] === true;
      const compiledEntityId = physicsEntityId(node);
      const q = new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ'));
      // The resolved world transform contains reference/materialization scaling;
      // geometry dimensions still describe the unscaled template primitive.
      const dimensions = transform.scale.map(Math.abs) as Vector3Tuple;
      const collider: ColliderDefinition = {
        id: `collider:${node.id}`,
        bodyId: node.id,
        shape: colliderShape(node),
        dimensions,
        offset: [0, 0, 0],
        friction: physics.friction ?? 0.7,
        restitution: physics.restitution ?? 0,
        sensor: physics.sensor ?? (cursor && !physicalCursor),
        // Default cursors see baseline (group 1) but not group 2 cursors. Baseline
        // sees both. Explicit authored groups always win.
        collisionGroups: physics['collision-groups'] ?? (cursor ? (2 << 16) | 1 : (1 << 16) | 3),
        solverGroups: physics['solver-groups'] ?? (cursor && !physicalCursor ? 0 : undefined),
        interactionRole: cursor ? 'cursor' : 'target',
      };
      const unsupportedCollider = node.geometry.operation === 'subtraction' || node.geometry.operation === 'intersection';
      if (unsupportedCollider) diagnose({
        line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
        message: `Physics collider omitted: ${node.geometry.operation} CSG tools cannot be represented faithfully by positive primitive colliders.`,
      });
      return {
        id: node.id,
        entityId: compiledEntityId,
        entityOrder,
        contributesToBounds: (!cursor || physicalCursor) && node.geometry.operation === undefined,
        bounds: node.bounds,
        position: [...transform.position],
        orientation: [q.x, q.y, q.z, q.w],
        mass: physics.mass,
        mode: modeByEntity.get(compiledEntityId),
        linearDamping: physics['linear-damping'],
        gravityScale: physics['gravity-scale'],
        ccd: physics.ccd,
        canSleep: physics['can-sleep'],
        enabledTranslations: physics['lock-translations']?.map((locked) => !locked) as [boolean, boolean, boolean] | undefined,
        enabledRotations: physics['lock-rotations']?.map((locked) => !locked) as [boolean, boolean, boolean] | undefined,
        friction: physics.friction,
        restitution: physics.restitution,
        revision,
        colliders: !unsupportedCollider && (node.geometry.operation === undefined || node.geometry.operation === 'union') ? [collider] : [],
        interactionIdentity: {
          id: node.id,
          namespace: node.namespacePath ?? (cursor ? node.id : ''),
          streamId: cursor ? (node.origin?.streamId ?? node.origin?.publicKey ?? 'secondary') : undefined,
          transactionId: node.origin?.transactionId,
          transactionTime: node.origin?.transactionTime,
          weight: node.origin?.transactionAmount,
        },
        retainsPhysicsState: !cursor || physicalCursor,
      };
    });

  const representativeByEntity = new Map<string, RigidBodyDefinition>();
  bodies.forEach((body) => { if (!representativeByEntity.has(body.entityId ?? body.id)) representativeByEntity.set(body.entityId ?? body.id, body); });
  const entityByNamespace = new Map(candidates.map((node, index) => [scopedPhysicsNamespace(node), bodies[index].entityId ?? bodies[index].id]));
  const joints: JointDefinition[] = [];
  const seenChildEntities = new Set<string>();
  candidates.forEach((node, index) => {
    const spec = node.physics;
    if (!spec?.joint) return;
    const childEntityId = bodies[index].entityId ?? bodies[index].id;
    if (seenChildEntities.has(childEntityId)) return;
    seenChildEntities.add(childEntityId);
    const parentPath = spec['joint-parent'];
    const childComponent = node.namespacePath?.split('/').filter(Boolean)[0];
    const parentComponent = parentPath?.split('/').filter(Boolean)[0];
    const parentEntityId = parentPath && parentComponent === childComponent
      ? entityByNamespace.get(scopedPhysicsNamespace(node, parentPath)) : undefined;
    const anchor = spec['joint-anchor'];
    const axis = spec['joint-axis'];
    if (!parentPath || !parentEntityId) {
      const message = parentPath && parentComponent !== childComponent
        ? `Joint parent "${parentPath}" is outside the child component. Articulation properties are component-local; world-space joint anchors are unsupported.`
        : `Joint parent "${parentPath ?? ''}" was not found in the same component instance and projection scope.`;
      diagnose({ line: Number(node.metadata?.lineNumber ?? 0), source: node.source, message });
      return;
    }
    if (parentEntityId === childEntityId) {
      diagnose({ line: Number(node.metadata?.lineNumber ?? 0), source: node.source, message: 'Joint endpoints must resolve to different rigid bodies.' });
      return;
    }
    const needsAxis = spec.joint === 'revolute' || spec.joint === 'prismatic';
    if (!anchor || anchor.some((v) => !Number.isFinite(v)) || (needsAxis && (!axis || axis.some((v) => !Number.isFinite(v)) || Math.hypot(...axis) === 0))) {
      diagnose({ line: Number(node.metadata?.lineNumber ?? 0), source: node.source, message: `${spec.joint} joints require a finite joint-anchor${needsAxis ? ' and a non-zero finite joint-axis' : ''}.` });
      return;
    }
    const parent = representativeByEntity.get(parentEntityId)!;
    const child = representativeByEntity.get(childEntityId)!;
    const parentNode = candidates[bodies.indexOf(parent)];
    const childNode = candidates[bodies.indexOf(child)];
    const parentPose = componentPoseFor(parentNode);
    const childPose = componentPoseFor(childNode);
    const componentScale = componentScaleFor(childNode);
    const scaledAnchor = new Vector3(...anchor).multiply(new Vector3(...componentScale));
    const localPoint = (pose: ReturnType<typeof componentPoseFor>): Vector3Tuple => {
      const q = new Quaternion().setFromEuler(new Euler(...pose.rotation, 'XYZ')).invert();
      const point = scaledAnchor.clone().sub(new Vector3(...pose.position)).applyQuaternion(q);
      return [point.x, point.y, point.z];
    };
    const componentAxis = new Vector3(...(axis ?? [1, 0, 0] as Vector3Tuple))
      .multiply(new Vector3(...componentScale)).normalize();
    const axisIn = (pose: ReturnType<typeof componentPoseFor>): Vector3Tuple => {
      const local = componentAxis.clone().applyQuaternion(new Quaternion().setFromEuler(new Euler(...pose.rotation, 'XYZ')).invert()).normalize();
      return [local.x, local.y, local.z];
    };
    const base = {
      id: `joint:${childEntityId}`,
      parentEntityId, childEntityId,
      parentAnchor: localPoint(parentPose), childAnchor: localPoint(childPose),
      collideConnected: spec['collide-connected'] ?? false,
    };
    if (spec.joint === 'fixed') joints.push({ ...base, kind: 'fixed',
      parentFrame: quaternionTuple(new Quaternion().setFromEuler(new Euler(...parentPose.rotation, 'XYZ')).invert()),
      childFrame: quaternionTuple(new Quaternion().setFromEuler(new Euler(...childPose.rotation, 'XYZ')).invert()) });
    else if (spec.joint === 'spherical') joints.push({ ...base, kind: 'spherical' });
    else joints.push({ ...base, kind: spec.joint, parentAxis: axisIn(parentPose), childAxis: axisIn(childPose),
      limits: spec['joint-limits']?.map((value) => spec.joint === 'revolute' ? value * Math.PI / 180 : value) as [number, number] | undefined,
      damping: spec['joint-damping'] });
  });
  const jointByChild = new Map(joints.map((joint) => [joint.childEntityId, joint]));
  const cyclicJointIds = new Set<string>();
  joints.forEach((joint) => {
    const path: JointDefinition[] = [];
    const visited = new Map<string, number>();
    let current: JointDefinition | undefined = joint;
    while (current) {
      const repeatedAt = visited.get(current.childEntityId);
      if (repeatedAt !== undefined) {
        path.slice(repeatedAt).forEach((entry) => cyclicJointIds.add(entry.id));
        break;
      }
      visited.set(current.childEntityId, path.length);
      path.push(current);
      current = jointByChild.get(current.parentEntityId);
    }
  });
  if (cyclicJointIds.size > 0) {
    candidates.filter((node, index) => cyclicJointIds.has(`joint:${bodies[index].entityId ?? bodies[index].id}`)).forEach((node) => diagnose({
      line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
      message: `Cyclic articulation is not supported: ${[...cyclicJointIds].sort().join(', ')}.`,
    }));
  }
  const validJoints = joints.filter(({ id }) => !cyclicJointIds.has(id));
  const connected = new Set(validJoints.flatMap((joint) => [joint.parentEntityId, joint.childEntityId]));
  const roots = [...connected].filter((id) => !validJoints.some((joint) => joint.childEntityId === id));
  if (connected.size && !roots.some((id) => (representativeByEntity.get(id)?.mode ?? 'dynamic') !== 'dynamic')) {
    const node = candidates.find((candidate, index) => connected.has(bodies[index].entityId ?? bodies[index].id));
    diagnose({ line: Number(node?.metadata?.lineNumber ?? 0), source: node?.source ?? '', message: 'Dynamic articulation tree has no static or kinematic root.' });
  }
  validJoints.forEach((joint) => {
    const a = representativeByEntity.get(joint.parentEntityId)?.mass ?? 1; const b = representativeByEntity.get(joint.childEntityId)?.mass ?? 1;
    if (Math.max(a, b) / Math.min(a, b) > 100) {
      const index = bodies.findIndex((body) => (body.entityId ?? body.id) === joint.childEntityId); const node = candidates[index];
      diagnose({ line: Number(node?.metadata?.lineNumber ?? 0), source: node?.source ?? '', message: `Extreme connected-body mass ratio (${Math.max(a,b) / Math.min(a,b)}:1) may be unstable.` });
    }
  });
  return { bodies, joints: validJoints };
}

function quaternionTuple(value: Quaternion): [number, number, number, number] { return [value.x, value.y, value.z, value.w]; }
