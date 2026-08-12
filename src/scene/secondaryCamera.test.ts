import { describe, expect, it } from 'vitest';
import type { SpatialTransform } from '../model/transform';
import { secondaryCameraPose } from './secondaryCamera';

const transform = (
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): SpatialTransform => ({ position, rotation, scale, pivot: [0, 0, 0] });

describe('secondaryCameraPose', () => {
  it('looks out from just beyond the positive XYZ corner of a unit cursor', () => {
    const pose = secondaryCameraPose(transform([0.5, 0.5, 0.5]));
    expect(pose.position[0]).toBeGreaterThan(1);
    expect(pose.position[1]).toBeGreaterThan(1);
    expect(pose.position[2]).toBeGreaterThan(1);
    expect(pose.direction[0]).toBeCloseTo(1 / Math.sqrt(3));
    expect(pose.direction[1]).toBeCloseTo(1 / Math.sqrt(3));
    expect(pose.direction[2]).toBeCloseTo(1 / Math.sqrt(3));
  });

  it('uses every positive extent of a nonuniform cursor', () => {
    expect(secondaryCameraPose(transform([1, 2, 3], [0, 0, 0], [2, 4, 6]), 0).position)
      .toEqual([2, 4, 6]);
  });

  it('translates the pose without changing its direction', () => {
    const original = secondaryCameraPose(transform([0, 0, 0]), 0);
    const translated = secondaryCameraPose(transform([4, -2, 7]), 0);
    expect(translated.position.map((value, axis) => value - original.position[axis])).toEqual([4, -2, 7]);
    expect(translated.direction).toEqual(original.direction);
  });

  it('rotates both the positive corner and outward direction', () => {
    const pose = secondaryCameraPose(transform([0, 0, 0], [0, Math.PI / 2, 0]), 0);
    expect(pose.position[0]).toBeCloseTo(0.5);
    expect(pose.position[1]).toBeCloseTo(0.5);
    expect(pose.position[2]).toBeCloseTo(-0.5);
    expect(pose.direction[0]).toBeCloseTo(1 / Math.sqrt(3));
    expect(pose.direction[1]).toBeCloseTo(1 / Math.sqrt(3));
    expect(pose.direction[2]).toBeCloseTo(-1 / Math.sqrt(3));
  });

  it('is stateless and clears zero-size cursors with its safety margin', () => {
    const cursor = transform([3, 4, 5], [0, 0, 0], [0, 0, 0]);
    expect(secondaryCameraPose(cursor)).toEqual(secondaryCameraPose(cursor));
    expect(secondaryCameraPose(cursor).position.every((value, axis) => value > cursor.position[axis])).toBe(true);
  });
});
