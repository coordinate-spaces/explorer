import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialBounds, SpatialNode } from '../model/SpatialNode';
import { nodePrecisionScale } from './cameraScale';

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

export function cameraNodeForSelection(
  spatialDocument: SpatialDocument,
  selectedNodeId?: string,
): SpatialNode | undefined {
  if (!selectedNodeId) return undefined;

  const renderedNode = spatialDocument.renderNodes.find((node) => node.id === selectedNodeId);
  if (renderedNode) return renderedNode;

  const expression = spatialDocument.csgExpressions.find(({ base }) => base.id === selectedNodeId);
  if (!expression) return undefined;

  const bounds = expression.operations.reduce((combined, { op, tool }) => {
    if (op === 'union') return unionBounds(combined, tool.bounds);
    if (op === 'intersection') return intersectionBounds(combined, tool.bounds) ?? combined;
    return combined;
  }, expression.base.bounds);
  const precisionScales = [
    nodePrecisionScale(expression.base),
    ...expression.operations.filter(({ op }) => op !== 'subtraction').map(({ tool }) => nodePrecisionScale(tool)),
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
