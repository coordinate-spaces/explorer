import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialNode } from './SpatialNode';

export interface CoordinateSpaceDimensions {
  width: number;
  depth: number;
  height: number;
}

export const DEFAULT_COORDINATE_SPACE_DIMENSIONS: CoordinateSpaceDimensions = {
  width: 40,
  depth: 40,
  height: 28,
};

// Keep two project units of clearance around authored geometry (20 cm).
export const COORDINATE_SPACE_MARGIN = 2;

function expandDimension(current: number, required: number): number {
  return Number.isFinite(required) && required > current ? Math.ceil(required) : current;
}

/** Dimensions are derived from authored bounds; transient movement must not enlarge the space. */
export function dimensionsFromNodes(nodes: readonly SpatialNode[]): CoordinateSpaceDimensions {
  return nodes.reduce<CoordinateSpaceDimensions>(
    (dimensions, node) => ({
      width: expandDimension(dimensions.width, node.bounds.maxX + COORDINATE_SPACE_MARGIN),
      depth: expandDimension(dimensions.depth, node.bounds.maxZ + COORDINATE_SPACE_MARGIN),
      height: expandDimension(dimensions.height, node.bounds.maxY + COORDINATE_SPACE_MARGIN),
    }),
    { ...DEFAULT_COORDINATE_SPACE_DIMENSIONS },
  );
}

export function wrapCoordinate(value: number, extent: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0) return value;
  if (value >= 0 && value < extent) return value;
  const wrapped = ((value % extent) + extent) % extent;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function translateBoxWithinCoordinateSpace(
  box: XyzDslBoxSpec,
  delta: readonly [number, number, number],
  space: CoordinateSpaceDimensions,
): XyzDslBoxSpec {
  return {
    ...box,
    x: wrapCoordinate(box.x + delta[0], space.width),
    y: Math.max(0, box.y + delta[1]),
    z: wrapCoordinate(box.z + delta[2], space.depth),
  };
}
