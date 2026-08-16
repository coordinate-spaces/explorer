import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { ColliderDefinition, ColliderShape, RigidBodyDefinition, Vector3Tuple } from './types';
import { Euler, Quaternion } from 'three';

function flatten(nodes: readonly SpatialNode[]): SpatialNode[] {
  return nodes.flatMap((node) => [node.renderable ? node : undefined, ...flatten(node.children ?? [])])
    .filter(Boolean) as SpatialNode[];
}

function entityId(node: SpatialNode): string {
  const component = node.namespacePath?.split('/').filter(Boolean)[0];
  return component ? `component:${component}` : `node:${node.id}`;
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
  const csgEntityByNodeId = new Map<string, string>();
  document.csgExpressions.forEach((expression) => {
    const id = entityId(expression.base);
    csgEntityByNodeId.set(expression.base.id, id);
    expression.operations.forEach(({ tool }) => csgEntityByNodeId.set(tool.id, id));
  });

  const candidates = flatten(document.nodes)
    .filter((node) => node.origin?.sourceKind !== 'secondary' || node.physics?.['physical-body'] === true);
  const modeByEntity = new Map<string, NonNullable<RigidBodyDefinition['mode']>>();
  candidates.forEach((node) => {
    const id = csgEntityByNodeId.get(node.id) ?? entityId(node);
    const mode = node.physics?.['physics-mode'] ?? 'dynamic';
    const established = modeByEntity.get(id);
    if (!established) modeByEntity.set(id, mode);
    else if (established !== mode) document.diagnostics.push({
      line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
      message: `Conflicting physics-mode "${mode}" in compound "${id}"; using first mode "${established}".`,
    });
  });

  return candidates.map((node, entityOrder): RigidBodyDefinition => {
      const transform = node.worldTransform ?? node.transform;
      const physics = node.physics ?? { diagnostics: [] };
      const compiledEntityId = csgEntityByNodeId.get(node.id) ?? entityId(node);
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
        sensor: physics.sensor ?? node.origin?.sourceKind === 'secondary',
        collisionGroups: physics['collision-groups'],
        solverGroups: physics['solver-groups'],
      };
      const unsupportedCollider = node.geometry.operation === 'subtraction' || node.geometry.operation === 'intersection';
      if (unsupportedCollider) document.diagnostics.push({
        line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
        message: `Physics collider omitted: ${node.geometry.operation} CSG tools cannot be represented faithfully by positive primitive colliders.`,
      });
      return {
        id: node.id,
        entityId: compiledEntityId,
        entityOrder,
        contributesToBounds: node.geometry.operation === undefined,
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
        colliders: !unsupportedCollider && node.geometry.operation === undefined ? [collider] : [],
      };
    });
}
