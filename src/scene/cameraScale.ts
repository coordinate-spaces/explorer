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

export function cameraSceneScale(nodes: readonly SpatialNode[], selectedNode?: SpatialNode): number {
  const selectedScale = selectedNode && smallestPositiveDimension(selectedNode);
  const dimensions = selectedScale ? [selectedScale] : nodes.flatMap((node) => smallestPositiveDimension(node) ?? []);
  const scale = dimensions.length > 0 ? Math.min(...dimensions) : 1;
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
