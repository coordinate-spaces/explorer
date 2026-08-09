import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { XyzDslBoxSpec, XyzDslTransformSpec } from '../xyzdsl/types';

export interface SpatialTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  pivot: [number, number, number];
}

export const IDENTITY_ROTATION: [number, number, number] = [0, 0, 0];
export const CENTER_PIVOT: [number, number, number] = [0, 0, 0];

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function transformFromBox(box: XyzDslBoxSpec, spec: XyzDslTransformSpec): SpatialTransform {
  return {
    position: [box.x + box.width / 2, box.y + box.height / 2, box.z + box.depth / 2],
    rotation: spec.rotation,
    scale: [box.width, box.height, box.depth],
    pivot: CENTER_PIVOT,
  };
}

export function anchorTransformFromBox(box: XyzDslBoxSpec, spec: XyzDslTransformSpec): SpatialTransform {
  return {
    position: [box.x, box.y, box.z],
    rotation: spec.rotation,
    scale: [1, 1, 1],
    pivot: CENTER_PIVOT,
  };
}

export function identityTransform(): SpatialTransform {
  return {
    position: [0, 0, 0],
    rotation: IDENTITY_ROTATION,
    scale: [1, 1, 1],
    pivot: CENTER_PIVOT,
  };
}

function matrixFromTransform(transform: SpatialTransform): Matrix4 {
  const position = new Vector3(...transform.position);
  const rotation = new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ'));
  const scale = new Vector3(...transform.scale);

  return new Matrix4().compose(position, rotation, scale);
}

function transformFromMatrix(matrix: Matrix4, pivot: [number, number, number]): SpatialTransform {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const euler = new Euler().setFromQuaternion(rotation, 'XYZ');

  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
    pivot,
  };
}

export function composeTransforms(parent: SpatialTransform, child: SpatialTransform): SpatialTransform {
  const matrix = matrixFromTransform(parent).multiply(matrixFromTransform(child));
  return transformFromMatrix(matrix, child.pivot);
}

/** Express an existing world transform relative to a parent transform. */
export function relativeTransform(parent: SpatialTransform, world: SpatialTransform): SpatialTransform {
  const matrix = matrixFromTransform(parent).invert().multiply(matrixFromTransform(world));
  return transformFromMatrix(matrix, world.pivot);
}
