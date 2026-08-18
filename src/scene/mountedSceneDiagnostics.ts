import { Vector3, type Box3, type Matrix4, type Mesh, type Quaternion } from 'three';
import type { Vector3Tuple } from '../physics/types';

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
  mountedAnchorWorld?: readonly number[];
  worldBoundingBox?: { min: readonly number[]; max: readonly number[] };
  parentAnchorWorld?: readonly number[];
  pivotError?: number;
  error?: 'missing-mounted-mesh' | 'multiple-mounted-meshes' | 'non-finite-mounted-geometry-pivot-error' | 'mounted-geometry-pivot-error';
}

export const vectorTuple = (value: Vector3): [number, number, number] => [value.x, value.y, value.z];
export const quaternionTuple = (value: Quaternion): [number, number, number, number] => [value.x, value.y, value.z, value.w];
export const matrixElements = (value: Matrix4): number[] => [...value.elements];
export const boxTuple = (value: Box3) => ({ min: vectorTuple(value.min), max: vectorTuple(value.max) });

/** Maps the backend child pivot through the mounted mesh rather than assuming it is the geometry top. */
export function mountedChildAnchorWorld(mesh: Mesh, childAnchor?: Vector3Tuple): Vector3 | undefined {
  if (mesh.userData.geometryInWorldSpace && Array.isArray(mesh.userData.authoredJointAnchor)) {
    return new Vector3(...mesh.userData.authoredJointAnchor).applyMatrix4(mesh.matrixWorld);
  }
  if (!childAnchor) return undefined;
  return new Vector3(...childAnchor).divide(mesh.getWorldScale(new Vector3())).applyMatrix4(mesh.matrixWorld);
}
