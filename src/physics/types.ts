import type { SpatialBounds } from '../model/SpatialNode';

export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type RigidBodyMode = 'dynamic' | 'kinematic' | 'static';

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
  | (TimedInput & { kind: 'kinematic-target'; position: Vector3Tuple })
  | (TimedInput & { kind: 'teleport'; position: Vector3Tuple; clearVelocity?: boolean });

export interface PhysicsFrame {
  tick: number;
  states: ReadonlyMap<string, RigidBodyState>;
}

export interface PhysicsSnapshot {
  tick: number;
  states: RigidBodyState[];
  definitions: RigidBodyDefinition[];
}
