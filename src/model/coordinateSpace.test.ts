import { describe, expect, it } from 'vitest';
import { translateBoxWithinCoordinateSpace, wrapCoordinate } from './coordinateSpace';

describe('XYZ coordinate wrapping', () => {
  it('uses positive modulo across either seam and multiple spans', () => {
    expect(wrapCoordinate(-0.01, 40)).toBeCloseTo(39.99);
    expect(wrapCoordinate(40, 40)).toBe(0);
    expect(wrapCoordinate(-80.01, 40)).toBeCloseTo(39.99);
    expect(wrapCoordinate(120.01, 40)).toBeCloseTo(0.01);
  });

  it('wraps X/Z, clamps Y, and preserves dimensions', () => {
    const box = { source: '', x: 0, y: 0, z: 49, width: 3, height: 4, depth: 5 };
    expect(translateBoxWithinCoordinateSpace(box, [-1, -2, 2], { width: 40, depth: 50, height: 28 }))
      .toEqual({ ...box, x: 39, y: 0, z: 1 });
  });
});
