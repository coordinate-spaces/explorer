import { BoxGeometry, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { modelFitTransform } from './modelFit';

describe('modelFitTransform', () => {
  it('contains an off-center model uniformly and can align it to the floor', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    mesh.position.set(3, 2, -1);
    expect(modelFitTransform(mesh, 'contain', 'floor')).toEqual({
      position: [-3, 0, 1],
      scale: [0.25, 0.25, 0.25],
    });
  });

  it('stretches each dimension independently', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    expect(modelFitTransform(mesh, 'stretch', 'center').scale).toEqual([0.5, 0.25, 1]);
  });
});
