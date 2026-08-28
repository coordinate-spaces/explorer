import type { PerspectiveCamera } from 'three';
import type { SpatialBounds, SpatialNode } from '../model/SpatialNode';
import { CONTENT_CARD_DEPTH } from './contentGeometry';

const MIN_SCENE_SCALE = 0.001;
const MAX_SCENE_SCALE = 10;

export function nodePrecisionScale(node: SpatialNode): number | undefined {
  const compositeScale = node.metadata?.cameraPrecisionScale;
  if (typeof compositeScale === 'number' && Number.isFinite(compositeScale) && compositeScale > 0) {
    return compositeScale;
  }

  const dimensions = node.transform.scale
    .map((value, index) => Math.abs(value) * (node.content?.kind && index === 2 ? CONTENT_CARD_DEPTH : 1))
    .filter((value) => Number.isFinite(value) && value > 0);

  return dimensions.length > 0 ? Math.min(...dimensions) : undefined;
}

function overallSceneExtent(
  nodes: readonly SpatialNode[],
  referencePosition: readonly [number, number, number],
): number | undefined {
  const axisExtents = [
    [referencePosition[0], ...nodes.flatMap(({ bounds }) => [bounds.minX, bounds.maxX])],
    [referencePosition[1], ...nodes.flatMap(({ bounds }) => [bounds.minY, bounds.maxY])],
    [referencePosition[2], ...nodes.flatMap(({ bounds }) => [bounds.minZ, bounds.maxZ])],
  ].map((axisValues) => {
    const values = axisValues.filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  });
  const extent = Math.max(...axisExtents);
  return extent > 0 ? extent : undefined;
}

export function cameraSceneScale(
  nodes: readonly SpatialNode[],
  selectedNode?: SpatialNode,
  referencePosition: readonly [number, number, number] = [0, 0, 0],
): number {
  const selectedScale = selectedNode && nodePrecisionScale(selectedNode);
  const scale = selectedScale ?? overallSceneExtent(nodes, referencePosition) ?? 1;
  return Math.min(MAX_SCENE_SCALE, Math.max(MIN_SCENE_SCALE, scale));
}

export function cameraClipPlanes(
  scale: number,
  nodes: readonly SpatialNode[],
  cameraPosition: readonly [number, number, number],
): { near: number; far: number } {
  return cameraClipPlanesForBounds(scale, sceneBoundsFromNodes(nodes), cameraPosition);
}

export function sceneBoundsFromNodes(nodes: readonly SpatialNode[]): SpatialBounds | undefined {
  return nodes.reduce<SpatialBounds | undefined>((combined, { bounds }) => {
    const values = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ];
    if (!values.every(Number.isFinite)) return combined;
    if (!combined) return { ...bounds };

    return {
      minX: Math.min(combined.minX, bounds.minX),
      maxX: Math.max(combined.maxX, bounds.maxX),
      minY: Math.min(combined.minY, bounds.minY),
      maxY: Math.max(combined.maxY, bounds.maxY),
      minZ: Math.min(combined.minZ, bounds.minZ),
      maxZ: Math.max(combined.maxZ, bounds.maxZ),
    };
  }, undefined);
}

export function cameraClipPlanesForBounds(
  scale: number,
  bounds: SpatialBounds | undefined,
  cameraPosition: readonly [number, number, number],
): { near: number; far: number } {
  const distanceX = bounds ? Math.max(Math.abs(bounds.minX - cameraPosition[0]), Math.abs(bounds.maxX - cameraPosition[0])) : 0;
  const distanceY = bounds ? Math.max(Math.abs(bounds.minY - cameraPosition[1]), Math.abs(bounds.maxY - cameraPosition[1])) : 0;
  const distanceZ = bounds ? Math.max(Math.abs(bounds.minZ - cameraPosition[2]), Math.abs(bounds.maxZ - cameraPosition[2])) : 0;
  const farthestDistance = Math.hypot(distanceX, distanceY, distanceZ);

  return {
    near: Math.max(0.0001, Math.min(0.05, scale * 0.02)),
    far: Math.max(100, farthestDistance * 2),
  };
}

export function updateCameraClipPlanes(
  camera: PerspectiveCamera,
  scale: number,
  bounds: SpatialBounds | undefined,
): boolean {
  const position = camera.position.toArray() as [number, number, number];
  const clips = cameraClipPlanesForBounds(scale, bounds, position);
  let changed = false;

  if (camera.near !== clips.near) {
    camera.near = clips.near;
    changed = true;
  }

  // Grow with headroom as the POV camera travels, avoiding a projection-matrix
  // update on every movement frame while ensuring the scene remains in range.
  if (clips.far > camera.far * 1.25) {
    camera.far = clips.far * 1.5;
    changed = true;
  }

  if (changed) camera.updateProjectionMatrix();
  return changed;
}
