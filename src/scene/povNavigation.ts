import { Vector3 } from 'three';

const WORLD_UP = new Vector3(0, 1, 0);

export interface PovMovementInput {
  right: number;
  up: number;
  backward: number;
}

export function worldAlignedPovMovement(
  { right, up, backward }: PovMovementInput,
  yaw: number,
  distance: number,
): Vector3 {
  const movement = new Vector3(right, up, backward);
  if (movement.lengthSq() === 0) return movement;

  return movement.normalize().applyAxisAngle(WORLD_UP, yaw).multiplyScalar(distance);
}
