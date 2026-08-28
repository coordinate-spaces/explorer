import { describe, expect, it } from 'vitest';
import { collisionProbeDistance, povCollisionRadius, worldAlignedPovMovement } from './povNavigation';

describe('worldAlignedPovMovement', () => {
  it('keeps vertical movement on the world Y axis', () => {
    const movement = worldAlignedPovMovement({ right: 0, up: 1, backward: 0 }, Math.PI / 2, 2);
    expect(movement.toArray()).toEqual([0, 2, 0]);
  });

  it('rotates horizontal movement using yaw only', () => {
    const movement = worldAlignedPovMovement({ right: 0, up: 0, backward: -1 }, Math.PI / 2, 1);
    expect(movement.x).toBeCloseTo(-1);
    expect(movement.y).toBe(0);
    expect(movement.z).toBeCloseTo(0);
  });

  it('returns a zero vector when there is no input', () => {
    expect(worldAlignedPovMovement({ right: 0, up: 0, backward: 0 }, 1, 3).toArray()).toEqual([0, 0, 0]);
  });

  it('bounds collision clearance independently from movement speed', () => {
    expect(povCollisionRadius(0.001)).toBe(0.0001);
    expect(povCollisionRadius(4)).toBeCloseTo(0.2);
    expect(povCollisionRadius(100)).toBe(0.25);
    expect(collisionProbeDistance(0.1, 0.2)).toBeCloseTo(0.3);
  });
});
