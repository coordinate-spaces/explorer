import { Euler, Quaternion, Vector3 } from 'three';
import type { SpatialTransform } from '../model/transform';

export type Vector3Tuple = [number, number, number];

export interface SecondaryCameraTarget {
  streamId: string;
  cursorNamespace: string;
}

export interface SecondaryCameraPose {
  position: Vector3Tuple;
  direction: Vector3Tuple;
}

export function secondaryCameraTargetKey(target: SecondaryCameraTarget): string {
  return `${target.streamId}\u0000${target.cursorNamespace}`;
}

/**
 * Places the POV just beyond the cursor's local positive-XYZ corner and aims
 * it diagonally away from the cursor origin. Both vectors inherit the cursor's
 * world rotation, so transaction history and direction of travel are irrelevant.
 */
export function secondaryCameraPose(
  transform: SpatialTransform,
  safetyMargin = 0.02,
): SecondaryCameraPose {
  const rotation = new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ'));
  const direction = new Vector3(1, 1, 1).normalize().applyQuaternion(rotation).normalize();
  const halfExtents = transform.scale.map((component) => Math.abs(component) / 2) as Vector3Tuple;
  const cornerOffset = new Vector3(...halfExtents).applyQuaternion(rotation);
  const position = new Vector3(...transform.position)
    .add(cornerOffset)
    .addScaledVector(direction, Math.max(0, safetyMargin));

  return {
    position: position.toArray(),
    direction: direction.toArray(),
  };
}
