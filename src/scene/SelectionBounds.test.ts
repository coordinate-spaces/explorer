import { describe, expect, it } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { selectionBoundsForNode, selectionBoundsTransform } from './SelectionBounds';

function contentNode(rotation: [number, number, number] = [0, 0, 0]): SpatialNode {
  return {
    id: 'content',
    source: '',
    box: { source: '', x: -1, y: -1.5, z: -5, width: 2, height: 3, depth: 10 },
    bounds: { minX: -1, maxX: 1, minY: -1.5, maxY: 1.5, minZ: -5, maxZ: 5 },
    material: { diagnostics: [] },
    content: { kind: 'text', text: 'Card', diagnostics: [] },
    geometry: { kind: 'box', dimensions: [2, 3, 10] },
    transform: { position: [0, 0, 0], rotation, scale: [2, 3, 10], pivot: [0, 0, 0] },
  };
}

describe('selectionBoundsTransform', () => {
  it('centers and sizes the wireframe to the complete axis-aligned bounds', () => {
    expect(selectionBoundsTransform({
      minX: -4,
      maxX: 2,
      minY: 3,
      maxY: 8,
      minZ: -1,
      maxZ: 7,
    })).toEqual({
      position: [-1, 5.5, 3],
      scale: [6, 5, 8],
    });
  });

  it('uses the rendered card depth for content bounds', () => {
    expect(selectionBoundsTransform(selectionBoundsForNode(contentNode())).scale).toEqual([2, 3, 0.4]);
  });

  it('applies content rotation when calculating the rendered bounds', () => {
    const scale = selectionBoundsTransform(selectionBoundsForNode(contentNode([0, Math.PI / 2, 0]))).scale;

    expect(scale[0]).toBeCloseTo(0.4);
    expect(scale[1]).toBeCloseTo(3);
    expect(scale[2]).toBeCloseTo(2);
  });
});
