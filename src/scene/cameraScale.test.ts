import { describe, expect, it } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { cameraClipPlanes, cameraSceneScale } from './cameraScale';

function node(dimensions: [number, number, number]): SpatialNode {
  return {
    id: dimensions.join('-'), source: '',
    box: { source: '', x: 0, y: 0, z: 0, width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
    bounds: { minX: 0, maxX: dimensions[0], minY: 0, maxY: dimensions[1], minZ: 0, maxZ: dimensions[2] },
    material: { diagnostics: [] }, geometry: { kind: 'box', dimensions },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: dimensions, pivot: [0, 0, 0] },
  };
}

describe('camera scene scale', () => {
  it('uses a selected small object for precision navigation', () => {
    expect(cameraSceneScale([node([2, 2, 2])], node([0.01, 0.02, 0.03]))).toBe(0.01);
  });

  it('has safe empty-scene and degenerate fallbacks', () => {
    expect(cameraSceneScale([])).toBe(1);
    expect(cameraSceneScale([node([0, 0, 0])])).toBe(1);
  });

  it('uses close clipping without sacrificing a useful far plane', () => {
    expect(cameraClipPlanes(0.001, 4)).toEqual({ near: 0.0001, far: 100 });
    expect(cameraClipPlanes(1, 100).far).toBe(400);
  });
});
