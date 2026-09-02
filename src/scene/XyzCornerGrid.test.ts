import { describe, expect, it } from 'vitest';
import {
  DECIMETRE_GRID_SPACING,
  GRID_DEPTH_MATERIAL,
  GRID_OFFSET,
  GRID_SURFACE_DEPTH_BIAS,
  createXyzGridLines,
  flattenGridLines,
} from './XyzCornerGrid';

describe('createXyzGridLines', () => {
  it('creates separate decimetre and metre layers on all three planes', () => {
    const grid = createXyzGridLines({ width: 1, depth: 1, height: 1 });

    expect(DECIMETRE_GRID_SPACING).toBe(0.1);
    for (const plane of ['xy', 'xz', 'yz'] as const) {
      expect(grid[plane].decimetres).toHaveLength(18);
      expect(grid[plane].metres).toHaveLength(4);
    }

    expect(grid.xy.decimetres[0]).toEqual([[0.1, 0, GRID_OFFSET], [0.1, 1, GRID_OFFSET]]);
    expect(grid.xz.decimetres[0]).toEqual([[0.1, GRID_OFFSET, 0], [0.1, GRID_OFFSET, 1]]);
    expect(grid.yz.decimetres[0]).toEqual([[GRID_OFFSET, 0.1, 0], [GRID_OFFSET, 0.1, 1]]);
  });

  it('ends at exact non-integer expanded dimensions without extending past them', () => {
    const dimensions = { width: 4.35, depth: 5.25, height: 4.15 };
    const grid = createXyzGridLines(dimensions);
    const allSegments = Object.values(grid).flatMap(({ decimetres, metres }) => [...decimetres, ...metres]);

    for (const segment of allSegments) {
      expect(segment[0][0]).toBeLessThanOrEqual(dimensions.width);
      expect(segment[1][0]).toBeLessThanOrEqual(dimensions.width);
      expect(segment[0][1]).toBeLessThanOrEqual(dimensions.height);
      expect(segment[1][1]).toBeLessThanOrEqual(dimensions.height);
      expect(segment[0][2]).toBeLessThanOrEqual(dimensions.depth);
      expect(segment[1][2]).toBeLessThanOrEqual(dimensions.depth);
    }

    expect(grid.xy.decimetres).toContainEqual([[dimensions.width, 0, GRID_OFFSET], [dimensions.width, dimensions.height, GRID_OFFSET]]);
    expect(grid.xz.decimetres).toContainEqual([[0, GRID_OFFSET, dimensions.depth], [dimensions.width, GRID_OFFSET, dimensions.depth]]);
    expect(grid.yz.decimetres).toContainEqual([[GRID_OFFSET, dimensions.height, 0], [GRID_OFFSET, dimensions.height, dimensions.depth]]);
  });
});

describe('grid rendering', () => {
  it('flattens line segments into a native Three.js position buffer', () => {
    const positions = flattenGridLines([
      [[0, 1, 2], [3, 4, 5]],
      [[6, 7, 8], [9, 10, 11]],
    ]);

    expect(positions).toBeInstanceOf(Float32Array);
    expect(Array.from(positions)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps depth testing, disables depth writes, and biases the filled surfaces', () => {
    expect(GRID_OFFSET).toBeGreaterThan(0.0015);
    expect(GRID_DEPTH_MATERIAL).toEqual({
      depthTest: true,
      depthWrite: false,
    });
    expect(GRID_SURFACE_DEPTH_BIAS).toEqual({
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  });
});
