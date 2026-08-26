import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_DIMENSIONS, ROOM_DIMENSION_MARGIN, dimensionsFromNodes } from './room';
import type { SpatialNode } from './SpatialNode';

function nodeWithBounds(bounds: Partial<SpatialNode['bounds']>): SpatialNode {
  return {
    id: 'node-1',
    source: '',
    box: {
      source: '',
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      height: 1,
      depth: 1,
    },
    bounds: {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      minZ: 0,
      maxZ: 1,
      ...bounds,
    },
    material: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [1, 1, 1] },
    transform: { position: [0.5, 0.5, 0.5], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] },
  };
}

describe('dimensionsFromNodes', () => {
  it('uses a realistic default room in project units', () => {
    expect(DEFAULT_ROOM_DIMENSIONS).toEqual({ width: 4, depth: 4, height: 4 });
    expect(ROOM_DIMENSION_MARGIN).toBe(0.2);
  });

  it('returns the default room dimensions for empty documents', () => {
    expect(dimensionsFromNodes([])).toEqual(DEFAULT_ROOM_DIMENSIONS);
  });

  it('keeps default dimensions when all nodes fit inside the room', () => {
    const dimensions = dimensionsFromNodes([
      nodeWithBounds({ maxX: 1, maxY: 0.7, maxZ: 1.2 }),
      nodeWithBounds({ maxX: 2, maxY: 1.6, maxZ: 1.8 }),
    ]);

    expect(dimensions).toEqual(DEFAULT_ROOM_DIMENSIONS);
  });

  it('expands overflowing dimensions to the next whole metre', () => {
    const dimensions = dimensionsFromNodes([nodeWithBounds({ maxX: 4.12, maxY: 3.04, maxZ: 4.21 })]);

    expect(dimensions).toEqual({
      width: 5,
      depth: 5,
      height: 4,
    });
  });

  it('grows an axis when its required extent is just over four metres', () => {
    const dimensions = dimensionsFromNodes([nodeWithBounds({ maxX: 3.81 })]);

    expect(dimensions).toEqual({ width: 5, depth: 4, height: 4 });
  });
});
