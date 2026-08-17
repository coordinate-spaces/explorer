import type { ParseDiagnostic } from '../xyzdsl/types';
import type { CsgExpression } from './csg';
import type { SpatialNode } from './SpatialNode';
import type { InteractionFact } from './interactions';
import type { CoordinateSpaceDimensions } from './coordinateSpace';
import type { ResolvedIntent } from '../xyzdsl/resolveDocument';

export interface SpatialDocument {
  id: string;
  nodes: SpatialNode[];
  renderNodes: SpatialNode[];
  csgExpressions: CsgExpression[];
  diagnostics: ParseDiagnostic[];
  coordinateSpace: CoordinateSpaceDimensions;
  interactions?: InteractionFact[];
  /** Fixed simulation tick used to produce node transforms, when physics is enabled. */
  physicsTick?: number;
  /** Non-renderable controller instructions resolved against baseline definitions. */
  intents?: ResolvedIntent[];
}
