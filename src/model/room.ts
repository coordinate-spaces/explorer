import type { SpatialNode } from './SpatialNode';

export interface RoomDimensions {
  width: number;
  depth: number;
  height: number;
}

export const DEFAULT_ROOM_DIMENSIONS: RoomDimensions = {
  width: 4,
  depth: 4,
  height: 4,
};

// Keep 20 cm of clearance around authored geometry.
export const ROOM_DIMENSION_MARGIN = 0.2;

// Arithmetic in parsed transforms can leave an exact metre boundary a few ULPs high.
const ROOM_DIMENSION_EPSILON = 1e-9;

function expandDimension(current: number, required: number): number {
  if (!Number.isFinite(required) || required <= current) {
    return current;
  }

  return Math.ceil(required - ROOM_DIMENSION_EPSILON);
}

export function dimensionsFromNodes(nodes: SpatialNode[]): RoomDimensions {
  return nodes.reduce<RoomDimensions>(
    (dimensions, node) => ({
      width: expandDimension(dimensions.width, node.bounds.maxX + ROOM_DIMENSION_MARGIN),
      depth: expandDimension(dimensions.depth, node.bounds.maxZ + ROOM_DIMENSION_MARGIN),
      height: expandDimension(dimensions.height, node.bounds.maxY + ROOM_DIMENSION_MARGIN),
    }),
    { ...DEFAULT_ROOM_DIMENSIONS },
  );
}
