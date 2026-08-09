import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';

export function nodesForCoordinateSpaceSizing(document: SpatialDocument): SpatialNode[] {
  const csgBoundsNodes = document.csgExpressions.flatMap((expression) => [
    expression.base,
    ...expression.operations.filter((operation) => operation.op === 'union').map((operation) => operation.tool),
  ]);

  return [...document.renderNodes, ...csgBoundsNodes];
}
