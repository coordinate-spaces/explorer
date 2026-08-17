import type { SpatialBounds } from '../model/SpatialNode';

export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type RigidBodyMode = 'dynamic' | 'kinematic' | 'static';
export type ColliderShape = 'cuboid' | 'ball' | 'cylinder' | 'cone' | 'capsule';

export interface JointDefinition {
  id: string;
  kind: 'revolute';
  parentEntityId: string;
  childEntityId: string;
  parentAnchor: Vector3Tuple;
  childAnchor: Vector3Tuple;
  parentAxis: Vector3Tuple;
  childAxis: Vector3Tuple;
  limits?: [number, number];
  damping?: number;
  collideConnected?: boolean;
}

export interface ColliderDefinition {
  id: string;
  bodyId: string;
  shape: ColliderShape;
  dimensions: Vector3Tuple;
  offset: Vector3Tuple;
  orientation?: QuaternionTuple;
  sensor?: boolean;
  friction?: number;
  restitution?: number;
  collisionGroups?: number;
  solverGroups?: number;
  /** Logical interaction role; unlike an engine handle this survives rebuilds and replay. */
  interactionRole?: 'target' | 'cursor';
}

/** Stable provenance needed to construct the public InteractionFact without backend data. */
export interface InteractionIdentity {
  id: string;
  namespace: string;
  streamId?: string;
  transactionId?: string;
  transactionTime?: number;
  weight?: number;
}

/** Immutable, engine-neutral narrow-phase result for one logical cursor/target pair. */
export interface InteractionQueryResult {
  tick: number;
  state: 'touch' | 'breach';
  target: InteractionIdentity;
  cursor: InteractionIdentity & { streamId: string };
  targetColliderId: string;
  cursorColliderId: string;
  /** Unit vector pointing out of the cursor and toward the target. */
  normal: Vector3Tuple;
  /** Per-axis target-center direction, used only when the geometric normal is degenerate. */
  inferredDirection: Vector3Tuple;
  /** Positive shape overlap depth along the representative geometric contact normal. */
  penetration?: number;
  /** Target translation distance along `normal` needed to resolve the representative contact. */
  resolutionDistance?: number;
  /** Shortest geometry-to-geometry distance for a non-penetrating touch. */
  separation?: number;
}

export interface InteractionQueryOptions {
  tolerance?: number;
  /** Periodic X/Z dimensions. The nearest image is selected without changing stable identity. */
  periodicSpace?: { width: number; depth: number };
}

export interface RigidBodyDefinition {
  id: string;
  /** Bodies with the same entity id are packed and stacked as one rigid component. */
  entityId?: string;
  /** Authored entity order used for deterministic packing precedence. */
  entityOrder?: number;
  /** False for CSG tools that follow their entity without contributing collision volume. */
  contributesToBounds?: boolean;
  bounds: SpatialBounds;
  position: Vector3Tuple;
  orientation?: QuaternionTuple;
  mass?: number;
  mode?: RigidBodyMode;
  linearDamping?: number;
  restitution?: number;
  friction?: number;
  revision?: string;
  colliders?: ColliderDefinition[];
  interactionIdentity?: InteractionIdentity;
  /** False for transaction-authored cursor proxies whose pose must not outlive their authored frame. */
  retainsPhysicsState?: boolean;
  gravityScale?: number;
  ccd?: boolean;
  canSleep?: boolean;
  enabledTranslations?: [boolean, boolean, boolean];
  enabledRotations?: [boolean, boolean, boolean];
}

export interface RigidBodyState {
  id: string;
  position: Vector3Tuple;
  orientation: QuaternionTuple;
  linearVelocity: Vector3Tuple;
  angularVelocity: Vector3Tuple;
  sleeping: boolean;
  tick: number;
}

interface TimedInput {
  bodyId: string;
  tick: number;
  stableSourceOrder?: number;
}

export type PhysicsInput =
  | (TimedInput & { kind: 'force' | 'impulse'; vector: Vector3Tuple })
  | (TimedInput & { kind: 'translation'; vector: Vector3Tuple })
  | (TimedInput & { kind: 'orientation'; orientation: QuaternionTuple })
  | (TimedInput & { kind: 'kinematic-target'; position: Vector3Tuple })
  | (TimedInput & { kind: 'teleport'; position: Vector3Tuple; clearVelocity?: boolean });

export interface PhysicsFrame {
  tick: number;
  states: ReadonlyMap<string, RigidBodyState>;
}

export interface PhysicsSnapshot {
  schemaVersion?: 1;
  backend?: string;
  tick: number;
  states: RigidBodyState[];
  definitions: RigidBodyDefinition[];
  joints?: JointDefinition[];
}
