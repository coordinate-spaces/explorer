import type { Object3D } from 'three';

export function spatialNodeIdFromObject(object: Object3D | null): string | undefined {
  let current = object;
  while (current) {
    if (typeof current.userData.spatialNodeId === 'string') return current.userData.spatialNodeId;
    current = current.parent;
  }
  return undefined;
}
