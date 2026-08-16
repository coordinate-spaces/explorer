import { describe, expect, it } from 'vitest';
import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromBox, boundsFromTransformedBox, resolveCollisions } from './collision';
import { degreesToRadians, transformFromBox } from './transform';

function box(overrides: Partial<XyzDslBoxSpec> = {}): XyzDslBoxSpec {
  return {
    source: '+0+4/+0+2/+0+2',
    x: 0,
    y: 0,
    z: 0,
    width: 4,
    height: 2,
    depth: 2,
    ...overrides,
  };
}

function node(
  id: string,
  nodeBox: XyzDslBoxSpec,
  rotation: [number, number, number] = [0, 0, 0],
  namespacePath?: string,
  lineNumber = 1,
): SpatialNode {
  const transform = transformFromBox(nodeBox, { rotation, diagnostics: [] });
  const namespaceSegments = namespacePath?.split('/').filter(Boolean) ?? [];
  const parentNamespacePath = namespaceSegments.length > 1
    ? `${namespaceSegments.slice(0, -1).join('/')}/`
    : undefined;

  return {
    id,
    source: nodeBox.source,
    box: nodeBox,
    bounds: boundsFromTransformedBox(nodeBox, transform),
    material: { diagnostics: [] },
    physics: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [nodeBox.width, nodeBox.height, nodeBox.depth] },
    transform,
    worldTransform: transform,
    localTransform: transform,
    namespacePath,
    parentNamespacePath,
    metadata: { lineNumber },
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
      node('node-1', box(), [0, degreesToRadians(45), 0], 'Chair/Seat/'),
      node('node-2', box({ source: '+4+1/+0+2/+0+1', x: 4, width: 1, depth: 1 }), [0, 0, 0], 'Chair/Back/'),
    ]);

    expect(grouped[0].unionGroupId).toBe('union-1');
    expect(grouped[1].unionGroupId).toBe('union-1');
  });

  it('does not union colliding objects from different component spaces', () => {
    const grouped = assignUnionGroups([
      node('a', box(), [0, 0, 0], 'Chair/Part/'),
      node('b', box(), [0, 0, 0], 'Table/Part/'),
    ]);
    expect(grouped.map((item) => item.unionGroupId)).toEqual([undefined, undefined]);
  });
});

describe('resolveCollisions', () => {
  it('packs a newer global object at the closest deterministic free coordinate', () => {
    const resolved = resolveCollisions([
      node('old', box(), [0, 0, 0], undefined, 1),
      node('new', box(), [0, 0, 0], undefined, 2),
    ]);

    expect(resolved[1].bounds.minY).toBe(2);
    expect(resolved[1].transform.position[1]).toBe(3);
    expect(resolved.map((item) => item.unionGroupId)).toEqual([undefined, undefined]);
  });

  it('uses another free face when the closest immediate position is occupied', () => {
    const resolved = resolveCollisions([
      node('old', box(), [0, 0, 0], undefined, 1),
      node('blocker', box({ x: 4 }), [0, 0, 0], undefined, 2),
      node('new', box(), [0, 0, 0], undefined, 3),
    ]);

    expect(resolved[2].bounds.minY).toBe(2);
  });

  it('leaves touching global objects in their authored positions', () => {
    const resolved = resolveCollisions([
      node('old', box(), [0, 0, 0], undefined, 1),
      node('new', box({ x: 4 }), [0, 0, 0], undefined, 2),
    ]);
    expect(resolved[1].bounds.minX).toBe(4);
  });

  it('packs all parts of a component with one shared translation', () => {
    const largeBox = box({ width: 4, height: 10, depth: 10 });
    const resolved = resolveCollisions([
      node('obstacle', largeBox, [0, 0, 0], undefined, 1),
      node('left', box({ x: -1, width: 2, height: 10, depth: 10 }), [0, 0, 0], 'Fixture/Left/', 2),
      node('right', box({ x: 3, width: 2, height: 10, depth: 10 }), [0, 0, 0], 'Fixture/Right/', 3),
    ]);

    expect(resolved[1].transform.position[0] - 0).toBe(5);
    expect(resolved[2].transform.position[0] - 4).toBe(5);
    expect(resolved[2].transform.position[0] - resolved[1].transform.position[0]).toBe(4);
  });
});
