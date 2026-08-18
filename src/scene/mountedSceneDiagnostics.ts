import type { Box3, Matrix4, Quaternion, Vector3 } from 'three';

export const MOUNTED_GEOMETRY_PIVOT_TOLERANCE = 0.02;

export interface MountedSceneDiagnostic {
  nodeId: string;
  physicsEntityId: string;
  meshCount: number;
  matrixWorld?: readonly number[];
  worldPosition?: readonly number[];
  worldQuaternion?: readonly number[];
  worldScale?: readonly number[];
  topWorldPosition?: readonly number[];
  worldBoundingBox?: { min: readonly number[]; max: readonly number[] };
  parentAnchorWorld?: readonly number[];
  pivotError?: number;
  error?: 'missing-mounted-mesh' | 'multiple-mounted-meshes' | 'non-finite-mounted-geometry-pivot-error' | 'mounted-geometry-pivot-error';
}

export const vectorTuple = (value: Vector3): [number, number, number] => [value.x, value.y, value.z];
export const quaternionTuple = (value: Quaternion): [number, number, number, number] => [value.x, value.y, value.z, value.w];
export const matrixElements = (value: Matrix4): number[] => [...value.elements];
export const boxTuple = (value: Box3) => ({ min: vectorTuple(value.min), max: vectorTuple(value.max) });
