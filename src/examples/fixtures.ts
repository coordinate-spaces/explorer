import type { ArticulationCapabilities } from '../physics/articulationCapabilities';

export type ExampleInput =
  | { readonly tick: number; readonly kind: 'child-impulse'; readonly vector: readonly [number, number, number] }
  | { readonly tick: number; readonly kind: 'joint-position-target'; readonly value: number };

/** Every number in this contract is deliberately fixture-owned. */
export interface ExampleTolerances {
  readonly pivotError: number;
  readonly limitOvershoot: number;
  readonly staticRootDrift: number;
  readonly fixedRelativeTransform: number;
  readonly prismaticOffAxis: number;
  readonly reconciliation: number;
  readonly replayDivergence: number;
  readonly targetConvergence: number;
  readonly maximumSpeed: number;
  readonly maximumAppliedEffort: number;
  readonly contactObstruction: number;
  readonly requestedAchieved: number;
  readonly motorReplayDivergence: number;
}

export interface ArticulationFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly capabilities: ArticulationCapabilities;
  readonly ticks: number;
  readonly inputs: readonly ExampleInput[];
  readonly snapshotTicks: readonly number[];
  readonly tolerances: ExampleTolerances;
  readonly expectedTransitions: { readonly enter: number; readonly stay: number; readonly leave: number };
  readonly motor?: { readonly minimum: number; readonly maximum: number; readonly initial: number };
}

export const passivePendulumSource = [
  '"Pendulum/+0+1/+0+1/+0+1" : ""',
  '"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static; color: 0x22304a"',
  '"Pendulum/Rod/+83c+20c/+304c+5/+45c+10c" : "body: Rod; mass: 1; color: 0xf6c453; rotation: 0,0,10; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -75 75; joint-damping: 0.08"',
].join('\n');
