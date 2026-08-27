import { describe, expect, it } from 'vitest';
import { BufferGeometry, LineBasicMaterial, LineSegments, Object3D } from 'three';
import { spatialNodeIdForPovRaycast, spatialNodeIdFromObject } from './povPicking';

describe('spatialNodeIdFromObject', () => {
  it('finds selection metadata on an ancestor', () => {
    const parent = new Object3D();
    const child = new Object3D();
    parent.userData.spatialNodeId = 'selected-node';
    parent.add(child);
    expect(spatialNodeIdFromObject(child)).toBe('selected-node');
  });

  it('returns undefined outside spatial geometry', () => {
    expect(spatialNodeIdFromObject(new Object3D())).toBeUndefined();
  });

  it('excludes selection outlines from POV raycasts', () => {
    const parent = new Object3D();
    const outline = new LineSegments(new BufferGeometry(), new LineBasicMaterial());
    parent.userData.spatialNodeId = 'selected-node';
    parent.add(outline);
    expect(spatialNodeIdForPovRaycast(outline)).toBeUndefined();
  });
});
