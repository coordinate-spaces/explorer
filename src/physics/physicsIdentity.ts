import type { SpatialNode } from '../model/SpatialNode';

/** Stable projection scope shared by body compilation and namespace lookup. */
export function physicsOriginScope(node: SpatialNode): string {
  return node.origin?.sourceKind === 'secondary'
    ? `secondary:${node.origin.streamId ?? node.origin.publicKey ?? 'unknown'}`
    : 'baseline';
}

/** Body-aware entity identity used by validation and physics compilation. */
export function authoredPhysicsEntityId(node: SpatialNode): string {
  const component = node.namespacePath?.split('/').filter(Boolean)[0];
  const body = node.physics?.body;
  const localId = component
    ? `component:${component}${body ? `/body:${body}` : ''}`
    : `node:${node.id}`;
  return node.origin?.sourceKind === 'secondary'
    ? `${physicsOriginScope(node)}:${localId}`
    : localId;
}

/** Namespace identity that cannot collide across baseline/projection streams. */
export function scopedPhysicsNamespace(node: SpatialNode, namespace = node.namespacePath ?? ''): string {
  return `${physicsOriginScope(node)}\0${namespace}`;
}
