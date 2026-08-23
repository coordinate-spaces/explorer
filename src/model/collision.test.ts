import { describe, expect, it } from 'vitest';
import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromBox, boundsFromTransformedBox } from './collision';
import { degreesToRadians, transformFromBox } from './transform';

function box(overrides: Partial<XyzDslBoxSpec> = {}): XyzDslBoxSpec {
  return {
    source: '+0d+4d/+0d+2d/+0d+2d',
    x: 0,
    y: 0,
    z: 0,
    width: 4,
    height: 2,
    depth: 2,
    ...overrides,
  };
}

function node(id: string, nodeBox: XyzDslBoxSpec, rotation: [number, number, number] = [0, 0, 0]): SpatialNode {
  const transform = transformFromBox(nodeBox, { rotation, diagnostics: [] });

  return {
    id,
    source: nodeBox.source,
    box: nodeBox,
    bounds: boundsFromTransformedBox(nodeBox, transform),
    material: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [nodeBox.width, nodeBox.height, nodeBox.depth] },
    transform,
  };
}

describe('boundsFromTransformedBox', () => {
  it('matches axis-aligned bounds when rotation is omitted', () => {
    expect(boundsFromBox(box())).toEqual({
      minX: 0,
      maxX: 4,
      minY: 0,
      maxY: 2,
      minZ: 0,
      maxZ: 2,
    });
  });

  it('swaps X and Z extents around the centered Y axis for a 90-degree rotation', () => {
    const nodeBox = box();
    const transform = transformFromBox(nodeBox, { rotation: [0, degreesToRadians(90), 0], diagnostics: [] });
    const bounds = boundsFromTransformedBox(nodeBox, transform);

    expect(bounds.minX).toBeCloseTo(1);
    expect(bounds.maxX).toBeCloseTo(3);
    expect(bounds.minZ).toBeCloseTo(-1);
    expect(bounds.maxZ).toBeCloseTo(3);
  });

  it('expands the world-space AABB for diagonal rotation', () => {
    const nodeBox = box();
    const transform = transformFromBox(nodeBox, { rotation: [0, degreesToRadians(45), 0], diagnostics: [] });
    const bounds = boundsFromTransformedBox(nodeBox, transform);

    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.maxX).toBeGreaterThan(4);
    expect(bounds.minZ).toBeLessThan(0);
    expect(bounds.maxZ).toBeGreaterThan(2);
  });
});

describe('assignUnionGroups', () => {
  it('uses transformed bounds so rotated nodes can be union-grouped', () => {
    const grouped = assignUnionGroups([
      node('node-1', box(), [0, degreesToRadians(45), 0]),
      node('node-2', box({ source: '+4d+1d/+0d+2d/+0d+1d', x: 4, width: 1, depth: 1 })),
    ]);

    expect(grouped[0].unionGroupId).toBe('union-1');
    expect(grouped[1].unionGroupId).toBe('union-1');
  });
});
