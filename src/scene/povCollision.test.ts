import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { sweptSphereIntersectsScene } from './povCollision';

describe('sweptSphereIntersectsScene', () => {
  it('detects a narrow obstacle anywhere inside the continuous swept radius', () => {
    const scene = new Group();
    scene.userData.spatialNodeId = 'obstacle';
    const obstacle = new Mesh(new BoxGeometry(0.05, 0.05, 0.05));
    obstacle.position.set(1, 0.15, 0.15);
    scene.add(obstacle);

    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, 0), new Vector3(2, 0, 0), 0.2)).toBe(true);
    obstacle.position.set(1, 1, 1);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, 0), new Vector3(2, 0, 0), 0.2)).toBe(false);
  });

  it('allows movement that escapes an existing radius overlap', () => {
    const scene = new Group();
    scene.userData.spatialNodeId = 'wall';
    scene.add(new Mesh(new BoxGeometry(1, 1, 1)));

    expect(sweptSphereIntersectsScene(scene, new Vector3(0.55, 0, 0), new Vector3(1, 0, 0), 0.2)).toBe(false);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0.55, 0, 0), new Vector3(0.51, 0, 0), 0.2)).toBe(true);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, 0), new Vector3(0.4, 0, 0), 0.2)).toBe(false);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0.4, 0, 0), new Vector3(0, 0, 0), 0.2)).toBe(true);
  });

  it('tests the rendered transforms of instanced meshes', () => {
    const scene = new Group();
    const instances = new InstancedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial(), 1);
    instances.userData.spatialNodeId = 'instances';
    instances.setMatrixAt(0, new Matrix4().makeTranslation(1, 0, 0));
    scene.add(instances);

    expect(sweptSphereIntersectsScene(scene, new Vector3(0.8, 0, 0), new Vector3(1.2, 0, 0), 0.05)).toBe(true);
    expect(sweptSphereIntersectsScene(scene, new Vector3(-0.2, 0, 0), new Vector3(0.2, 0, 0), 0.05)).toBe(false);
  });

  it('blocks movement through a non-selectable room surface', () => {
    const scene = new Group();
    const wall = new Mesh(new PlaneGeometry(2, 2));
    wall.userData.povCollisionSurface = true;
    scene.add(wall);

    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, 0.5), new Vector3(0, 0, -0.5), 0.1)).toBe(true);
  });
});
