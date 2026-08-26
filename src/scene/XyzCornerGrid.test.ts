import { describe, expect, it } from 'vitest';
import { createCornerGridLinePositions } from './XyzCornerGrid';

describe('createCornerGridLinePositions', () => {
  it.each([
    ['floor', 492],
    ['backWall', 492],
    ['sideWall', 492],
  ] as const)('creates a complete 4m x 4m decimetre grid for the %s', (plane, coordinateCount) => {
    const positions = createCornerGridLinePositions({ plane, width: 4, depth: 4, height: 4 });

    // Forty-one lines in each direction, with two XYZ vertices per line.
    expect(positions).toHaveLength(coordinateCount);
  });

  it('spaces adjacent grid lines one decimetre apart', () => {
    const positions = createCornerGridLinePositions({ plane: 'floor', width: 1, depth: 1, height: 1 });

    expect(positions[6]).toBeCloseTo(0.1);
  });
});
