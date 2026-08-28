import type { SpatialNode } from './SpatialNode';

export function linearTransformStepForNode(node: SpatialNode): number {
  const dimensions = [node.box.width, node.box.height, node.box.depth].filter((value) => value > 0);
  const smallest = Math.min(...dimensions);
  if (!Number.isFinite(smallest)) return 0.01;
  return Math.max(0.001, Math.min(10, 10 ** Math.floor(Math.log10(smallest) - 1)));
}
