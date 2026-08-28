import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
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
});
