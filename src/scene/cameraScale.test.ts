import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SpatialNode } from '../model/SpatialNode';
import { cameraClipPlanes, cameraSceneScale, updateCameraClipPlanes } from './cameraScale';

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

  it('uses oriented transform dimensions for a rotated selected object', () => {
    const selected = node([10, 10, 0.01]);
    selected.bounds = { minX: -7, maxX: 7, minY: -7, maxY: 7, minZ: -7, maxZ: 7 };
    selected.transform.rotation = [0.8, 0.6, 0.4];
    expect(cameraSceneScale([node([100, 100, 100])], selected)).toBe(0.01);
  });

  it('uses overall scene extent when no object is selected', () => {
    expect(cameraSceneScale([node([100, 0.01, 100])])).toBe(10);
    expect(cameraSceneScale([
      node([1, 1, 1], [-20, 0, 0]),
      node([1, 1, 1], [20, 0, 0]),
    ])).toBe(10);
  });

  it('includes distance from the initial camera in the unselected scene scale', () => {
    expect(cameraSceneScale([node([1, 1, 1], [1000, 0, 0])], undefined, [1.4, 1.1, 1.8])).toBe(10);
  });

  it('has safe empty-scene and degenerate fallbacks', () => {
    expect(cameraSceneScale([])).toBe(1);
    expect(cameraSceneScale([node([0, 0, 0])])).toBe(1);
  });

  it('uses close clipping without sacrificing a useful far plane', () => {
    expect(cameraClipPlanes(0.001, [], [1.4, 1.1, 1.8])).toEqual({ near: 0.0001, far: 100 });
    expect(cameraClipPlanes(1, [node([1, 1, 1], [-300, 0, 0])], [1.4, 1.1, 1.8]).far).toBeGreaterThan(600);
  });

  it('grows the far plane from the live camera position as POV navigation moves away', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');
    camera.position.set(250, 0, 0);

    expect(updateCameraClipPlanes(camera, 1, [node([1, 1, 1])])).toBe(true);
    expect(camera.far).toBeGreaterThan(500);
    expect(updateProjectionMatrix).toHaveBeenCalledOnce();
  });
});
