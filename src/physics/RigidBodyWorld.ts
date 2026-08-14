import type { PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition } from './types';

/** Engine-neutral boundary owned by the transaction/simulation layer. */
export interface RigidBodyWorld {
  readonly tick: number;
  readonly ticksPerSecond: number;
  reconcileDefinitions(definitions: readonly RigidBodyDefinition[]): void;
  enqueueInputs(inputs: readonly PhysicsInput[]): void;
  step(targetTick?: number): PhysicsFrame;
  frame(): PhysicsFrame;
  snapshot(): PhysicsSnapshot;
  restore(snapshot: PhysicsSnapshot): void;
  dispose(): void;
}
