import { BoxGeometry, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { mountedChildAnchorWorld } from './mountedSceneDiagnostics';

describe('mounted scene diagnostics', () => {
  it('measures the authored child pivot instead of assuming the normalized top', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    mesh.position.set(4, 5, 6);
    mesh.scale.set(2, 4, 6);
    mesh.updateWorldMatrix(true, false);

    expect(mountedChildAnchorWorld(mesh, [0, 0, 0])?.toArray()).toEqual([4, 5, 6]);
    expect(mountedChildAnchorWorld(mesh, [0, -2, 0])?.toArray()).toEqual([4, 3, 6]);
  });

  it('supports CSG geometry whose authored transform is baked into its vertices', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    mesh.userData.geometryInWorldSpace = true;
    mesh.userData.authoredJointAnchor = [7, 8, 9];
    mesh.updateWorldMatrix(true, false);

    expect(mountedChildAnchorWorld(mesh, [100, 100, 100])?.toArray()).toEqual([7, 8, 9]);
  });
});
