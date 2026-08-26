import { BoxGeometry, Mesh, PlaneGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { modelFitTransform } from './modelFit';

describe('modelFitTransform', () => {
  it('contains an off-center model uniformly and can align it to the floor', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    mesh.position.set(3, 2, -1);
    expect(modelFitTransform(mesh, 'contain', 'floor')).toEqual({
      position: [-3, -2, 1],
      scale: [0.25, 0.25, 0.25],
    });
  });

  it('places a floor-aligned model on the normalized box lower face', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    const transform = modelFitTransform(mesh, 'contain', 'floor');
    const normalizedFloor = transform.scale[1] * (-2 + transform.position[1]);
    expect(normalizedFloor).toBe(-0.5);
  });

  it('stretches each dimension independently', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    expect(modelFitTransform(mesh, 'stretch', 'center').scale).toEqual([0.5, 0.25, 1]);
  });

  it('allows planar geometry for contain fitting but not stretch fitting', () => {
    const plane = new Mesh(new PlaneGeometry(2, 4));
    expect(modelFitTransform(plane, 'contain', 'center').scale).toEqual([0.25, 0.25, 0.25]);
    expect(() => modelFitTransform(plane, 'stretch', 'center')).toThrow(
      'Stretch fitting requires nonzero bounds on every axis.',
    );
  });

  it('preserves proportions while containing a model in a nonuniform target box', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 1));
    const transform = modelFitTransform(mesh, 'contain', 'center', [4, 2, 2]);
    const worldScale = transform.scale.map((value, index) => value * [4, 2, 2][index]);
    expect(worldScale).toEqual([0.5, 0.5, 0.5]);
    expect([2, 4, 1].map((value, index) => value * worldScale[index])).toEqual([1, 2, 0.5]);
  });
});
