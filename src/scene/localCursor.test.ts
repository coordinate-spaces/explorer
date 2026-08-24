import { describe, expect, it } from 'vitest';
import { createCursorDeclaration } from '../xyzdsl/editXyzDslSource';
import { cursorCoordinatePath, INITIAL_LOCAL_CURSOR, moveLocalCursor } from './localCursor';

describe('local cursor', () => {
  it('moves in the selected XYZDSL unit and respects the scene boundary', () => {
    const moved = moveLocalCursor({ ...INITIAL_LOCAL_CURSOR, unit: 'mm' }, [1, -1, 0]);
    expect(moved.position).toEqual([0.001, 0, 0]);
  });

  it('shows canonical mixed-unit coordinates', () => {
    expect(cursorCoordinatePath([1, 0.2, 0.003], [0.1, 0.01, 0.001])).toBe('+1+1d/+2d+1c/+3m+1m');
  });

  it('serializes anonymous and named previews without separate coordinate properties', () => {
    expect(createCursorDeclaration({
      position: [1, 0.2, 0.003],
      size: [0.1, 0.1, 0.1],
      namespace: 'Room/Probe',
      properties: { geometry: 'sphere', color: 'blue' },
    })).toBe('"Room/Probe/+1+1d/+2d+1d/+3m+1d" : "geometry: sphere; color: blue"');
  });
});
