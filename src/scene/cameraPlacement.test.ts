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

  it('places the camera close enough to inspect millimetre-sized geometry', () => {
    const millimetreNode = {
      bounds: { minX: 0, maxX: 0.001, minY: 0, maxY: 0.001, minZ: 0, maxZ: 0.001 },
    } as SpatialNode;
    const pose = inspectionPose(millimetreNode);

    expect(pose.target).toEqual([0.0005, 0.0005, 0.0005]);
    expect(pose.position[2]).toBeCloseTo(0.002);
  });
});
