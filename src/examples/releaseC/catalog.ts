import { RELEASE_C_CAPABILITIES } from '../../physics/articulationCapabilities';
import { passivePendulumSource, type ArticulationFixture } from '../fixtures';

export const RELEASE_C_FIXTURES: readonly ArticulationFixture[] = [{
  id: 'driven-hinge', title: 'Bounded servo hinge',
  description: 'A production position controller drives the joint without writing the child transform.',
  source: passivePendulumSource.replace('joint-damping: 0.08', 'joint-damping: 0.08; motor-mode: position; motor-target: 0; motor-max-speed: 90; motor-max-effort: 18; motor-stiffness: 24; motor-damping: 5'),
  capabilities: RELEASE_C_CAPABILITIES, ticks: 60,
  inputs: [{ tick: 1, kind: 'joint-position-target', value: 0 }], snapshotTicks: [20],
  expectedTransitions: { enter: 0, stay: 0, leave: 0 },
  tolerances: { pivotError: 0.025, limitOvershoot: 0.025, staticRootDrift: 1e-9,
    fixedRelativeTransform: 0.025, prismaticOffAxis: 0.025, reconciliation: 0.025,
    replayDivergence: 1e-7, targetConvergence: 0.08, maximumSpeed: Math.PI / 2 + 0.025,
    maximumAppliedEffort: 18, contactObstruction: 0.25, requestedAchieved: 0.08,
    motorReplayDivergence: 1e-7 },
  motor: { minimum: -60, maximum: 60, initial: 0 },
}];
