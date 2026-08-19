import type { SpatialBounds } from '../model/SpatialNode';

export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type RigidBodyMode = 'dynamic' | 'kinematic' | 'static';
export type ColliderShape = 'cuboid' | 'ball' | 'cylinder' | 'cone' | 'capsule';

interface JointDefinitionBase {
  id: string;
  parentEntityId: string;
  childEntityId: string;
  /** Immutable parent-body-local physics-space anchor. */
  parentAnchor: Vector3Tuple;
  /** Immutable child-body-local physics-space anchor. */
  childAnchor: Vector3Tuple;
  collideConnected?: boolean;
  /** Active drive limits. Values use this joint's documented coordinate units. */
  motor?: JointMotorDefinition;
}

export type JointMotorMode = 'position' | 'velocity' | 'effort' | 'passive';
export interface JointMotorDefinition {
  mode: JointMotorMode;
  target?: number;
  velocity?: number;
  /** Finite coordinate-units/s (rad/s for revolute). Required for target drives. */
  maxSpeed: number;
  /** Finite N*m for revolute and N for prismatic. Required for active drives. */
  maxEffort: number;
  stiffness?: number;
  damping?: number;
}

/** Engine-neutral hinge. Anchors and axes are body-local physics-space values; angular limits are radians. */
export interface RevoluteJointDefinition extends JointDefinitionBase {
  kind: 'revolute'; parentAxis: Vector3Tuple; childAxis: Vector3Tuple;
  /** Viscous angular damping coefficient in N*m*s/rad. */
  limits?: [number, number]; damping?: number;
}
/** Engine-neutral slider. Anchors/axes are body-local; limits are project units. */
export interface PrismaticJointDefinition extends JointDefinitionBase {
  kind: 'prismatic'; parentAxis: Vector3Tuple; childAxis: Vector3Tuple;
  /** Viscous translational damping coefficient in N*s/project-unit. */
  limits?: [number, number]; damping?: number;
}
/** A weld whose independent frames are expressed in each body's local coordinates. */
export interface FixedJointDefinition extends JointDefinitionBase {
  kind: 'fixed'; parentFrame: QuaternionTuple; childFrame: QuaternionTuple;
}
/** A ball-and-socket pivot. Cone/twist limits are deliberately unsupported. */
export interface SphericalJointDefinition extends JointDefinitionBase { kind: 'spherical' }

export type JointDefinition = RevoluteJointDefinition | PrismaticJointDefinition | FixedJointDefinition | SphericalJointDefinition;

export interface ArticulationInspection {
  id: string; parentEntityId: string; childEntityId: string; kind: JointDefinition['kind'];
  tick: number;
  hasActiveHandle: boolean;
  parentMode?: RigidBodyMode;
  childMode?: RigidBodyMode;
  /** Derived runtime world-simulation-space parent anchor; never authored input. */
  parentAnchorWorld?: Vector3Tuple;
  /** Derived runtime world-simulation-space child anchor; never authored input. */
  childAnchorWorld?: Vector3Tuple;
  /** Radians for revolute, project units for prismatic. */
  coordinate?: number; limits?: [number, number]; pivotError?: number;
  /** A backend integrity failure suitable for surfacing as an application error. */
  error?: 'missing-handle' | 'non-finite-pivot-error' | 'persistent-pivot-error';
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

interface TimedBodyInput {
  bodyId: string;
  tick: number;
  stableSourceOrder?: number;
}

export type PhysicsInput =
  | (TimedBodyInput & { kind: 'force' | 'impulse'; vector: Vector3Tuple })
  | (TimedBodyInput & { kind: 'translation'; vector: Vector3Tuple })
  | (TimedBodyInput & { kind: 'orientation'; orientation: QuaternionTuple })
  | (TimedBodyInput & { kind: 'kinematic-target'; position: Vector3Tuple })
  | (TimedBodyInput & { kind: 'teleport'; position: Vector3Tuple; clearVelocity?: boolean })
  | { kind: 'joint-position-target' | 'joint-velocity-target' | 'joint-effort'; jointId: string; tick: number; stableSourceOrder?: number; value: number;
      controllerPriority?: number; blendWeight?: number; exclusive?: boolean };

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
  /** Active stable-ID motor commands required to continue an exact replay. */
  jointMotors?: Array<{ jointId: string; mode: 'position' | 'velocity' | 'effort'; value: number; appliedTarget?: number }>;
}
