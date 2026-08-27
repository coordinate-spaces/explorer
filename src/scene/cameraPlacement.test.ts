import { describe, expect, it } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { inspectionPose } from './cameraPlacement';

const node = {
  bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4, minZ: 3, maxZ: 5 },
} as SpatialNode;

describe('inspectionPose', () => {
  it('looks at the bounds center from outside the selected object', () => {
    expect(inspectionPose(node)).toEqual({ position: [2, 3, 7], target: [2, 3, 4] });
  });

  it('handles an invalid forward vector deterministically', () => {
    expect(inspectionPose(node, [0, 0, 0]).position).toEqual([2, 3, 7]);
  });
});
