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

export function cameraClipPlanes(scale: number, roomExtent: number): { near: number; far: number } {
  return {
    near: Math.max(0.0001, Math.min(0.05, scale * 0.02)),
    far: Math.max(100, roomExtent * 4),
  };
}
