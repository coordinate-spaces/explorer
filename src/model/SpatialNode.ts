import type { XyzDslBoxSpec, XyzDslContentSpec, XyzDslMaterialSpec, XyzDslModelSpec } from '../xyzdsl/types';
import type { SpatialGeometry } from './geometry';
import type { SpatialTransform } from './transform';

export interface SpatialBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SpatialNode {
  id: string;
  source: string;
  box: XyzDslBoxSpec;
  bounds: SpatialBounds;
  material: XyzDslMaterialSpec;
  content?: XyzDslContentSpec;
  model?: XyzDslModelSpec;
  geometry: SpatialGeometry;
  transform: SpatialTransform;
  localTransform?: SpatialTransform;
  worldTransform?: SpatialTransform;
  namespacePath?: string;
  parentNamespacePath?: string;
  renderable?: boolean;
  unionGroupId?: string;
  csgExpressionId?: string;
  csgConsumed?: boolean;
  children?: SpatialNode[];
  metadata?: Record<string, unknown>;
}
