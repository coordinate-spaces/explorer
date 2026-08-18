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
  /** Published-pose anchor error evaluated through the transforms passed to flattened meshes; this does not inspect mounted Three.js geometry. */
  meshAnchorError?: number;
  /** Child-body-local physics-space anchor, used to inspect mounted geometry at the corresponding point. */
  childAnchor?: JointDefinition['childAnchor'];
  /** Child-body-local physics-space hinge axis, retained for constraint visualization. */
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
