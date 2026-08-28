import { Vector3 } from 'three';

const WORLD_UP = new Vector3(0, 1, 0);
const MIN_COLLISION_RADIUS = 0.0001;
const MAX_COLLISION_RADIUS = 0.25;

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

export function povCollisionRadius(sceneScale: number): number {
  const scaledRadius = Number.isFinite(sceneScale) ? sceneScale * 0.05 : MIN_COLLISION_RADIUS;
  return Math.min(MAX_COLLISION_RADIUS, Math.max(MIN_COLLISION_RADIUS, scaledRadius));
}
