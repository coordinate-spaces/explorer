import { describe, expect, it } from 'vitest';
import { createCornerGridLinePositions, createMetreCornerGridLinePositions } from './XyzCornerGrid';

describe('createCornerGridLinePositions', () => {
  it.each([
    ['floor', 432],
    ['backWall', 432],
    ['sideWall', 432],
  ] as const)('creates a complete 4m x 4m decimetre grid for the %s', (plane, coordinateCount) => {
    const positions = createCornerGridLinePositions({ plane, width: 4, depth: 4, height: 4 });

    // Thirty-six non-metre lines in each direction, with two XYZ vertices per line.
    expect(positions).toHaveLength(coordinateCount);
  });

  it('spaces adjacent grid lines one decimetre apart', () => {
    const positions = createCornerGridLinePositions({ plane: 'floor', width: 1, depth: 1, height: 1 });

    expect(positions[0]).toBeCloseTo(0.1);
    expect(positions[6]).toBeCloseTo(0.2);
  });
});

describe('createMetreCornerGridLinePositions', () => {
  it.each(['floor', 'backWall', 'sideWall'] as const)('creates paired metre lines for the %s', (plane) => {
    const positions = createMetreCornerGridLinePositions({ plane, width: 4, depth: 4, height: 4 });

    // Five metre marks in each direction, with two lines and two XYZ vertices per mark.
    expect(positions).toHaveLength(120);
  });

  it('places each metre pair on opposite sides of its metre mark', () => {
    const positions = createMetreCornerGridLinePositions({ plane: 'floor', width: 1, depth: 1, height: 1 });

    expect(positions[0]).toBeCloseTo(-0.006);
    expect(positions[6]).toBeCloseTo(0.006);
    expect(positions[0] + positions[6]).toBeCloseTo(0);
  });

  it.each([
    ['floor', 108],
    ['backWall', 96],
    ['sideWall', 84],
  ] as const)('does not add a metre mark beyond fractional %s bounds', (plane, coordinateCount) => {
    const positions = createMetreCornerGridLinePositions({ plane, width: 4.1, depth: 3.2, height: 2.3 });

    expect(positions).toHaveLength(coordinateCount);
  });
});
