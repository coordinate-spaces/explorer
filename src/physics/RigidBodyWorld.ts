import type { InteractionQueryOptions, InteractionQueryResult, JointDefinition, PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition } from './types';

/** Engine-neutral boundary owned by the transaction/simulation layer. */
export interface RigidBodyWorld {
  readonly tick: number;
  readonly ticksPerSecond: number;
  reconcileDefinitions(definitions: readonly RigidBodyDefinition[], joints?: readonly JointDefinition[]): void;
  enqueueInputs(inputs: readonly PhysicsInput[]): void;
  step(targetTick?: number): PhysicsFrame;
  frame(): PhysicsFrame;
  /** Read-only narrow-phase query of post-step poses at the current completed tick. */
  queryInteractions(options?: InteractionQueryOptions): readonly InteractionQueryResult[];
  snapshot(): PhysicsSnapshot;
  restore(snapshot: PhysicsSnapshot): void;
  dispose(): void;
}
