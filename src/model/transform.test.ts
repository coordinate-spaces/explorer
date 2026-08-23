import { describe, expect, it } from 'vitest';
import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialTransform } from './transform';
import { composeTransforms, degreesToRadians, transformFromBox } from './transform';

const box: XyzDslBoxSpec = {
  source: '+2d+4d/+7d+6d/+1d+3d',
  x: 2,
  y: 7,
  z: 1,
  width: 4,
  height: 6,
  depth: 3,
};

describe('transformFromBox', () => {
  it('derives center position and scale from an edge-based bounding box', () => {
    expect(transformFromBox(box, { rotation: [0, degreesToRadians(90), 0], diagnostics: [] })).toEqual({
      position: [4, 10, 2.5],
      rotation: [0, Math.PI / 2, 0],
      scale: [4, 6, 3],
      pivot: [0, 0, 0],
    });
  });
});

describe('composeTransforms', () => {
  it('composes child translations under parent translations', () => {
    const parent = { position: [3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] } satisfies SpatialTransform;
    const child = { position: [2, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] } satisfies SpatialTransform;

    expect(composeTransforms(parent, child).position).toEqual([5, 1, 0]);
  });

  it('rotates child translations through the parent transform', () => {
    const parent = { position: [0, 0, 0], rotation: [0, degreesToRadians(90), 0], scale: [1, 1, 1], pivot: [0, 0, 0] } satisfies SpatialTransform;
    const child = { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] } satisfies SpatialTransform;

    expect(composeTransforms(parent, child).position[0]).toBeCloseTo(0);
    expect(composeTransforms(parent, child).position[2]).toBeCloseTo(-2);
  });

  it('composes parent and child scale', () => {
    const parent = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 3, 4], pivot: [0, 0, 0] } satisfies SpatialTransform;
    const child = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [5, 6, 7], pivot: [0, 0, 0] } satisfies SpatialTransform;

    expect(composeTransforms(parent, child).scale).toEqual([10, 18, 28]);
  });
});
