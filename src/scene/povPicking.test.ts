import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { spatialNodeIdFromObject } from './povPicking';

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
});
