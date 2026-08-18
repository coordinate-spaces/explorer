import { BoxGeometry, Mesh, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mountedChildAnchorWorld, mountedChildAxisWorld } from './mountedSceneDiagnostics';

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

  it('uses the baked body orientation for a CSG hinge axis', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    mesh.userData.geometryInWorldSpace = true;
    mesh.userData.bakedWorldQuaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1), Math.PI / 2,
    ).toArray();
    mesh.updateWorldMatrix(true, false);

    const axis = mountedChildAxisWorld(mesh, [1, 0, 0])!;
    expect(axis.x).toBeCloseTo(0);
    expect(axis.y).toBeCloseTo(1);
    expect(axis.z).toBeCloseTo(0);
  });
});
