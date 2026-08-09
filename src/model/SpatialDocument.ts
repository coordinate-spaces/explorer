import type { ParseDiagnostic } from '../xyzdsl/types';
import type { CsgExpression } from './csg';
import type { SpatialNode } from './SpatialNode';
import type { InteractionFact } from './interactions';
import type { CoordinateSpaceDimensions } from './coordinateSpace';

export interface SpatialDocument {
  id: string;
  nodes: SpatialNode[];
  renderNodes: SpatialNode[];
  csgExpressions: CsgExpression[];
  diagnostics: ParseDiagnostic[];
  coordinateSpace: CoordinateSpaceDimensions;
  interactions?: InteractionFact[];
}
