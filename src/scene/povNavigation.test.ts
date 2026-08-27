import { describe, expect, it } from 'vitest';
import { worldAlignedPovMovement } from './povNavigation';

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
});
