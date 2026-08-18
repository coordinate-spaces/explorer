import type { XyzDslBoxSpec, XyzDslContentSpec, XyzDslMaterialSpec, XyzDslPhysicsSpec } from '../xyzdsl/types';
import type { SpatialGeometry } from './geometry';
import type { SpatialTransform } from './transform';
import type { InteractionFact } from './interactions';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';

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
  physics: XyzDslPhysicsSpec;
  content?: XyzDslContentSpec;
  geometry: SpatialGeometry;
  transform: SpatialTransform;
  /** Authored/materialized component-local pose before scene publication. */
  localTransform?: SpatialTransform;
  /** Resolved world-space pose before a completed render document is published. */
  worldTransform?: SpatialTransform;
  /** Authoritative published world-space pose for a node in the flattened render list. */
  renderTransform?: SpatialTransform;
  /** Resolved world-space pose before periodic secondary-cursor wrapping. */
  unwrappedTransform?: SpatialTransform;
  namespacePath?: string;
  parentNamespacePath?: string;
  renderable?: boolean;
  unionGroupId?: string;
  csgExpressionId?: string;
  csgConsumed?: boolean;
  children?: SpatialNode[];
  metadata?: Record<string, unknown>;
  origin?: XyzDslDeclarationOrigin;
  baseBox?: XyzDslBoxSpec;
  activeInteractions?: InteractionFact[];
}
