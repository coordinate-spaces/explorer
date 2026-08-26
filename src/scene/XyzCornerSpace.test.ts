import { describe, expect, it } from 'vitest';
import { createCornerLinePositions } from './XyzCornerSpace';

describe('createCornerLinePositions', () => {
  it.each([
    ['floor', 60],
    ['backWall', 60],
    ['sideWall', 60],
  ] as const)('creates a complete 4m x 4m line plane for the %s', (plane, coordinateCount) => {
    const positions = createCornerLinePositions({ plane, width: 4, depth: 4, height: 4 });

    // Five lines in each direction, with two XYZ vertices per line.
    expect(positions).toHaveLength(coordinateCount);
  });
});
