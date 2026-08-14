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

  return flatten(document.nodes)
    .filter((node) => node.origin?.sourceKind !== 'secondary')
    .map((node, entityOrder): RigidBodyDefinition => {
      const transform = node.worldTransform ?? node.transform;
      const q = new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ'));
      const dimensions = [...node.geometry.dimensions] as Vector3Tuple;
      const collider: ColliderDefinition = {
        id: `collider:${node.id}`,
        bodyId: node.id,
        shape: colliderShape(node),
        dimensions,
        offset: [0, 0, 0],
        friction: 0.7,
        restitution: 0,
      };
      return {
        id: node.id,
        entityId: csgEntityByNodeId.get(node.id) ?? entityId(node),
        entityOrder,
        contributesToBounds: node.geometry.operation === undefined,
        bounds: node.bounds,
        position: [...transform.position],
        orientation: [q.x, q.y, q.z, q.w],
        mass: node.origin?.transactionAmount,
        revision,
        colliders: node.geometry.operation === undefined ? [collider] : [],
      };
    });
}
