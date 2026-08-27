import { Vector3 } from 'three';
import type { SpatialNode } from '../model/SpatialNode';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export function inspectionPose(node: SpatialNode, forward: [number, number, number] = [0, 0, -1]): CameraPose {
  const target = new Vector3(
    (node.bounds.minX + node.bounds.maxX) / 2,
    (node.bounds.minY + node.bounds.maxY) / 2,
    (node.bounds.minZ + node.bounds.maxZ) / 2,
  );
  const dimensions = [node.bounds.maxX - node.bounds.minX, node.bounds.maxY - node.bounds.minY, node.bounds.maxZ - node.bounds.minZ]
    .filter((value) => Number.isFinite(value) && value > 0);
  const distance = Math.max(0.05, (dimensions.length ? Math.max(...dimensions) : 1) * 1.5);
  const direction = new Vector3(...forward);
  if (direction.lengthSq() === 0) direction.set(0, 0, -1);
  direction.normalize();
  const position = target.clone().addScaledVector(direction, -distance);
  return { position: position.toArray(), target: target.toArray() };
}
