import type { ParseDiagnostic } from '../xyzdsl/types';
import type { CsgExpression } from './csg';
import type { SpatialNode } from './SpatialNode';
import type { InteractionFact } from './interactions';
import type { CoordinateSpaceDimensions } from './coordinateSpace';
import type { ResolvedIntent } from '../xyzdsl/resolveDocument';
import type { ArticulationInspection, JointDefinition, Vector3Tuple } from '../physics/types';

export interface PhysicsJointDiagnostic {
  nodeId: string;
  nodeName: string;
  kind: JointDefinition['kind'];
  /** The installed constraint, when this declaration survived compilation and world reconciliation. */
  articulation?: ArticulationInspection;
  /** Separation between anchors evaluated through the exact transforms passed to flattened meshes. */
  meshAnchorError?: number;
  /** Child pivot in rigid-body local units, used to inspect the mounted mesh at that point. */
  childAnchor?: JointDefinition['childAnchor'];
  /** Child-local hinge axis, retained so the renderer can visualize the installed constraint. */
  childAxis?: Vector3Tuple;
}

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
  /** Diagnostics captured from the active physics world, never from a UI-side recompilation. */
  physicsJoints?: readonly PhysicsJointDiagnostic[];
  /** Non-renderable controller instructions resolved against baseline definitions. */
  intents?: ResolvedIntent[];
}
