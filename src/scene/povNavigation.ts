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

export function collisionProbeDistance(stepDistance: number, cameraRadius: number): number {
  return Math.max(0, stepDistance) + Math.max(0, cameraRadius);
}

export function collisionProbeOrigins(position: Vector3, direction: Vector3, cameraRadius: number): Vector3[] {
  const forward = direction.clone().normalize();
  if (!forward.lengthSq() || cameraRadius <= 0) return [position.clone()];

  const reference = Math.abs(forward.y) < 0.9 ? WORLD_UP : new Vector3(1, 0, 0);
  const right = new Vector3().crossVectors(forward, reference).normalize();
  const up = new Vector3().crossVectors(forward, right).normalize();
  const origins = [position.clone()];

  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4;
    const offset = right.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(up, Math.sin(angle))
      .multiplyScalar(cameraRadius);
    origins.push(position.clone().add(offset));
  }

  return origins;
}
