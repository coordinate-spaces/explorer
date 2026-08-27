import type { PerspectiveCamera } from 'three';
import type { SpatialNode } from '../model/SpatialNode';

const MIN_SCENE_SCALE = 0.001;
const MAX_SCENE_SCALE = 10;

function smallestPositiveDimension(node: SpatialNode): number | undefined {
  const dimensions = [
    node.bounds.maxX - node.bounds.minX,
    node.bounds.maxY - node.bounds.minY,
    node.bounds.maxZ - node.bounds.minZ,
  ].filter((value) => Number.isFinite(value) && value > 0);

  return dimensions.length > 0 ? Math.min(...dimensions) : undefined;
}

function overallSceneExtent(nodes: readonly SpatialNode[]): number | undefined {
  const axisExtents = [
    nodes.flatMap(({ bounds }) => [bounds.minX, bounds.maxX]),
    nodes.flatMap(({ bounds }) => [bounds.minY, bounds.maxY]),
    nodes.flatMap(({ bounds }) => [bounds.minZ, bounds.maxZ]),
  ].map((axisValues) => {
    const values = axisValues.filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  });
  const extent = Math.max(...axisExtents);
  return extent > 0 ? extent : undefined;
}

export function cameraSceneScale(nodes: readonly SpatialNode[], selectedNode?: SpatialNode): number {
  const selectedScale = selectedNode && smallestPositiveDimension(selectedNode);
  const scale = selectedScale ?? overallSceneExtent(nodes) ?? 1;
  return Math.min(MAX_SCENE_SCALE, Math.max(MIN_SCENE_SCALE, scale));
}

export function cameraClipPlanes(
  scale: number,
  nodes: readonly SpatialNode[],
  cameraPosition: readonly [number, number, number],
): { near: number; far: number } {
  const farthestDistance = nodes.reduce((farthest, { bounds }) => {
    const distanceX = Math.max(Math.abs(bounds.minX - cameraPosition[0]), Math.abs(bounds.maxX - cameraPosition[0]));
    const distanceY = Math.max(Math.abs(bounds.minY - cameraPosition[1]), Math.abs(bounds.maxY - cameraPosition[1]));
    const distanceZ = Math.max(Math.abs(bounds.minZ - cameraPosition[2]), Math.abs(bounds.maxZ - cameraPosition[2]));
    return Math.max(farthest, Math.hypot(distanceX, distanceY, distanceZ));
  }, 0);

  return {
    near: Math.max(0.0001, Math.min(0.05, scale * 0.02)),
    far: Math.max(100, farthestDistance * 2),
  };
}

export function updateCameraClipPlanes(
  camera: PerspectiveCamera,
  scale: number,
  nodes: readonly SpatialNode[],
): boolean {
  const position = camera.position.toArray() as [number, number, number];
  const clips = cameraClipPlanes(scale, nodes, position);
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
