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
    physics: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [1, 1, 1] },
    transform: { position: [0.5, 0.5, 0.5], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] },
  };
}

describe('dimensionsFromNodes', () => {
  it('uses a realistic default room in project units', () => {
    expect(DEFAULT_ROOM_DIMENSIONS).toEqual({ width: 40, depth: 40, height: 28 });
    expect(ROOM_DIMENSION_MARGIN).toBe(2);
  });

  it('returns the default room dimensions for empty documents', () => {
    expect(dimensionsFromNodes([])).toEqual(DEFAULT_ROOM_DIMENSIONS);
  });

  it('keeps default dimensions when all nodes fit inside the room', () => {
    const dimensions = dimensionsFromNodes([
      nodeWithBounds({ maxX: 10, maxY: 7, maxZ: 12 }),
      nodeWithBounds({ maxX: 20, maxY: 16, maxZ: 18 }),
    ]);

    expect(dimensions).toEqual(DEFAULT_ROOM_DIMENSIONS);
  });

  it('expands dimensions to include nodes beyond the default perimeter with margin', () => {
    const dimensions = dimensionsFromNodes([nodeWithBounds({ maxX: 41.2, maxY: 30.4, maxZ: 42.1 })]);

    expect(dimensions).toEqual({
      width: Math.ceil(41.2 + ROOM_DIMENSION_MARGIN),
      depth: Math.ceil(42.1 + ROOM_DIMENSION_MARGIN),
      height: Math.ceil(30.4 + ROOM_DIMENSION_MARGIN),
    });
  });
});
