import { describe, expect, it } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { cameraClipPlanes, cameraSceneScale } from './cameraScale';

function node(dimensions: [number, number, number], position: [number, number, number] = [0, 0, 0]): SpatialNode {
  return {
    id: dimensions.join('-'), source: '',
    box: { source: '', x: position[0], y: position[1], z: position[2], width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
    bounds: { minX: position[0], maxX: position[0] + dimensions[0], minY: position[1], maxY: position[1] + dimensions[1], minZ: position[2], maxZ: position[2] + dimensions[2] },
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
    expect(cameraClipPlanes(0.001, [], [1.4, 1.1, 1.8])).toEqual({ near: 0.0001, far: 100 });
    expect(cameraClipPlanes(1, [node([1, 1, 1], [-300, 0, 0])], [1.4, 1.1, 1.8]).far).toBeGreaterThan(600);
  });
});
