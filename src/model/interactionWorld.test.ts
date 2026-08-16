import { describe, expect, it, vi } from 'vitest';
import type { SpatialNode } from './SpatialNode';
import { AabbInteractionIndex, InteractionWorld } from './interactions';

function node(id: string, minX: number, sourceKind: 'baseline' | 'secondary' = 'baseline'): SpatialNode {
  return {
    id, source: id, namespacePath: id, renderable: true,
    box: { source: id, x: minX, y: 0, z: 0, width: 1, height: 1, depth: 1 },
    bounds: { minX, maxX: minX + 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    material: { diagnostics: [] }, physics: { diagnostics: [] }, content: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [1, 1, 1] },
    transform: { position: [minX + 0.5, 0.5, 0.5], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] },
    origin: { sourceKind },
  };
}

describe('InteractionWorld', () => {
  it('retains and incrementally updates target proxies', () => {
    const index = new AabbInteractionIndex();
    const update = vi.spyOn(index, 'update');
    const remove = vi.spyOn(index, 'remove');
    const world = new InteractionWorld(index);
    world.updateTargets([node('Target/', 0)]);
    expect(world.evaluate([node('Cursor/', 1, 'secondary')])).toHaveLength(1);
    world.updateTargets([]);
    expect(remove).toHaveBeenCalledWith('Target/');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('uses the large-object fallback instead of enumerating unbounded cells', () => {
    const huge = node('Huge/', 0);
    huge.bounds.maxX = 1_000_000;
    const index = new AabbInteractionIndex([huge], 1, 10);
    expect(index.query(node('Query/', 999_999).bounds).map(({ id }) => id)).toEqual(['Huge/']);
  });
});
