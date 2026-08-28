import type { Object3D } from 'three';

export function spatialNodeIdFromObject(object: Object3D | null): string | undefined {
  let current = object;
  while (current) {
    if (typeof current.userData.spatialNodeId === 'string') return current.userData.spatialNodeId;
    current = current.parent;
  }
  return undefined;
}

export function spatialNodeIdForPovRaycast(object: Object3D): string | undefined {
  if ('isLine' in object && object.isLine) return undefined;
  return spatialNodeIdFromObject(object);
}

export function spatialNodeIdForPovCollision(object: Object3D): string | undefined {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.povCollisionIgnored === true) return undefined;
    current = current.parent;
  }
  return spatialNodeIdForPovRaycast(object);
}
