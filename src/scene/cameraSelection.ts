import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialBounds, SpatialNode } from '../model/SpatialNode';
import { nodePrecisionScale } from './cameraScale';
import { evaluateCsgExpressionWithContributions } from './csgGeometry';
import { findNodeById } from '../selection';
import { selectionBoundsForNode } from './SelectionBounds';

function unionBounds(bounds: SpatialBounds, addition: SpatialBounds): SpatialBounds {
  return {
    minX: Math.min(bounds.minX, addition.minX),
    maxX: Math.max(bounds.maxX, addition.maxX),
    minY: Math.min(bounds.minY, addition.minY),
    maxY: Math.max(bounds.maxY, addition.maxY),
    minZ: Math.min(bounds.minZ, addition.minZ),
    maxZ: Math.max(bounds.maxZ, addition.maxZ),
  };
}

function intersectionBounds(bounds: SpatialBounds, constraint: SpatialBounds): SpatialBounds | undefined {
  const intersection = {
    minX: Math.max(bounds.minX, constraint.minX),
    maxX: Math.min(bounds.maxX, constraint.maxX),
    minY: Math.max(bounds.minY, constraint.minY),
    maxY: Math.min(bounds.maxY, constraint.maxY),
    minZ: Math.max(bounds.minZ, constraint.minZ),
    maxZ: Math.min(bounds.maxZ, constraint.maxZ),
  };

  return intersection.minX <= intersection.maxX
    && intersection.minY <= intersection.maxY
    && intersection.minZ <= intersection.maxZ
    ? intersection
    : undefined;
}

function descendantIds(node: SpatialNode): Set<string> {
  const ids = new Set<string>();
  const visit = (current: SpatialNode) => {
    ids.add(current.id);
    current.children?.forEach(visit);
  };
  visit(node);
  return ids;
}

function nodeWithAggregateBounds(container: SpatialNode, descendants: SpatialNode[]): SpatialNode {
  const bounds = descendants
    .map(selectionBoundsForNode)
    .reduce(unionBounds);
  const precisionScales = descendants
    .map(nodePrecisionScale)
    .filter((scale): scale is number => scale !== undefined);

  return {
    ...container,
    bounds,
    transform: {
      ...container.transform,
      position: [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        (bounds.minZ + bounds.maxZ) / 2,
      ],
    },
    metadata: {
      ...container.metadata,
      ...(precisionScales.length > 0 ? { cameraPrecisionScale: Math.min(...precisionScales) } : {}),
    },
  };
}

export function cameraNodeForSelection(
  spatialDocument: SpatialDocument,
  selectedNodeId?: string,
): SpatialNode | undefined {
  if (!selectedNodeId) return undefined;

  const renderedNode = spatialDocument.renderNodes.find((node) => node.id === selectedNodeId);
  if (renderedNode) return renderedNode;

  const expression = spatialDocument.csgExpressions.find(({ base }) => base.id === selectedNodeId);
  if (!expression) {
    const hierarchyNode = findNodeById(spatialDocument.nodes, selectedNodeId);
    if (!hierarchyNode) return undefined;

    const ids = descendantIds(hierarchyNode);
    const renderedDescendants = spatialDocument.renderNodes.filter((node) => ids.has(node.id));
    const csgDescendants = spatialDocument.csgExpressions
      .filter(({ base, operations }) => (
        ids.has(base.id) || operations.some(({ tool }) => ids.has(tool.id))
      ))
      .map(({ base }) => cameraNodeForSelection(spatialDocument, base.id))
      .filter((node): node is SpatialNode => node !== undefined);
    const descendants = [...renderedDescendants, ...csgDescendants];

    return descendants.length > 0 ? nodeWithAggregateBounds(hierarchyNode, descendants) : undefined;
  }

  const fallbackBounds = expression.operations.reduce((combined, { op, tool }) => {
    if (op === 'union') return unionBounds(combined, tool.bounds);
    if (op === 'intersection') return intersectionBounds(combined, tool.bounds) ?? combined;
    return combined;
  }, expression.base.bounds);
  const { geometry, operationContributions } = evaluateCsgExpressionWithContributions(expression);
  geometry.computeBoundingBox();
  const evaluatedBounds = geometry.boundingBox && !geometry.boundingBox.isEmpty() ? geometry.boundingBox : undefined;
  const bounds = evaluatedBounds ? {
    minX: evaluatedBounds.min.x,
    maxX: evaluatedBounds.max.x,
    minY: evaluatedBounds.min.y,
    maxY: evaluatedBounds.max.y,
    minZ: evaluatedBounds.min.z,
    maxZ: evaluatedBounds.max.z,
  } : fallbackBounds;
  geometry.dispose();
  const evaluatedDimensions = evaluatedBounds ? [
    evaluatedBounds.max.x - evaluatedBounds.min.x,
    evaluatedBounds.max.y - evaluatedBounds.min.y,
    evaluatedBounds.max.z - evaluatedBounds.min.z,
  ].filter((dimension) => Number.isFinite(dimension) && dimension > 0) : [];
  const precisionScales = [
    ...(evaluatedDimensions.length > 0 ? [Math.min(...evaluatedDimensions)] : []),
    nodePrecisionScale(expression.base),
    ...expression.operations.map(({ tool }, operationIndex) => (
      operationContributions[operationIndex] ? nodePrecisionScale(tool) : undefined
    )),
  ].filter((scale): scale is number => scale !== undefined);
  const position: [number, number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];

  return {
    ...expression.base,
    bounds,
    metadata: {
      ...expression.base.metadata,
      ...(precisionScales.length > 0 ? { cameraPrecisionScale: Math.min(...precisionScales) } : {}),
    },
    transform: { ...expression.base.transform, position },
  };
}
