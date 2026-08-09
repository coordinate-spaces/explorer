import { describe, expect, it } from 'vitest';
import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialTransform } from './transform';
import { composeTransforms, degreesToRadians, relativeTransform, transformFromBox } from './transform';

const box: XyzDslBoxSpec = {
  source: '+2+4/+7+6/+1+3',
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

  it('recovers a local transform from a world transform under a rotated and scaled parent', () => {
    const parent = { position: [4, 2, 7], rotation: [0, degreesToRadians(90), 0], scale: [2, 3, 4], pivot: [0, 0, 0] } satisfies SpatialTransform;
    const child = { position: [5, 1, 3], rotation: [0, 0, 0], scale: [1, 2, 1], pivot: [0, 0, 0] } satisfies SpatialTransform;
    const world = composeTransforms(parent, child);
    const recovered = relativeTransform(parent, world);

    expect(recovered.position[0]).toBeCloseTo(child.position[0]);
    expect(recovered.position[1]).toBeCloseTo(child.position[1]);
    expect(recovered.position[2]).toBeCloseTo(child.position[2]);
    expect(recovered.scale[0]).toBeCloseTo(child.scale[0]);
    expect(recovered.scale[1]).toBeCloseTo(child.scale[1]);
    expect(recovered.scale[2]).toBeCloseTo(child.scale[2]);
  });
});
