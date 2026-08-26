import { describe, expect, it } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { linearStepForNode, rotationDegreesForInspector } from './SelectedNodeInspector';

function nodeWithSize(size: number): SpatialNode {
  return {
    id: 'node', source: '', box: { source: '', x: 0, y: 0, z: 0, width: size, height: size, depth: size },
    bounds: { minX: 0, maxX: size, minY: 0, maxY: size, minZ: 0, maxZ: size },
    material: { diagnostics: [] }, geometry: { kind: 'box', dimensions: [size, size, size] }, renderable: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [size, size, size], pivot: [0, 0, 0] },
  };
}

describe('linearStepForNode', () => {
  it('chooses millimetre through metre steps from object scale', () => {
    expect(linearStepForNode(nodeWithSize(0.005))).toBe(0.001);
    expect(linearStepForNode(nodeWithSize(0.05))).toBe(0.01);
    expect(linearStepForNode(nodeWithSize(0.5))).toBe(0.1);
    expect(linearStepForNode(nodeWithSize(2))).toBe(1);
  });
});

describe('rotationDegreesForInspector', () => {
  it('preserves fractional degree values in the inspector readout', () => {
    expect(rotationDegreesForInspector([0.5 * Math.PI / 180, 0, -12.25 * Math.PI / 180])).toEqual([0.5, 0, -12.25]);
  });

  it('limits floating-point noise without rounding to whole degrees', () => {
    expect(rotationDegreesForInspector([Math.PI / 3, Math.PI / 2, Math.PI])).toEqual([60, 90, 180]);
    expect(rotationDegreesForInspector([0.12345 * Math.PI / 180])).toEqual([0.123]);
  });
});
