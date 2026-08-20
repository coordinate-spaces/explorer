import { RELEASE_B_CAPABILITIES } from '../../physics/articulationCapabilities';
import { passivePendulumSource, type ArticulationFixture } from '../fixtures';

export const RELEASE_B_FIXTURES: readonly ArticulationFixture[] = [{
  id: 'passive-pendulum', title: 'Passive pendulum',
  description: 'Gravity, impulses, limits, snapshots, and replay—with every active capability disabled.',
  source: passivePendulumSource, capabilities: RELEASE_B_CAPABILITIES, ticks: 180,
  inputs: [{ tick: 10, kind: 'child-impulse', vector: [2.5, 0, 0] }], snapshotTicks: [60],
  expectedTransitions: { enter: 0, stay: 0, leave: 0 },
  tolerances: { pivotError: 0.025, limitOvershoot: 0.025, staticRootDrift: 1e-9,
    fixedRelativeTransform: 0.025, prismaticOffAxis: 0.025, reconciliation: 0.025,
    replayDivergence: 1e-7, targetConvergence: 0.025, maximumSpeed: Infinity,
    maximumAppliedEffort: Infinity, contactObstruction: 0.25, requestedAchieved: 0.025,
    motorReplayDivergence: 1e-7 },
}];
