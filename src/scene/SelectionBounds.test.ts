import { describe, expect, it } from 'vitest';
import { selectionBoundsTransform } from './SelectionBounds';

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
});
