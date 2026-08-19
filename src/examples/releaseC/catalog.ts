import { RELEASE_C_CAPABILITIES } from '../../physics/articulationCapabilities';
import { passivePendulumSource, type ArticulationFixture } from '../fixtures';

export const RELEASE_C_FIXTURES: readonly ArticulationFixture[] = [{
  id: 'driven-hinge', title: 'Bounded servo hinge',
  description: 'A production position controller drives the joint without writing the child transform.',
  source: passivePendulumSource.replace('joint-damping: 0.08', 'joint-damping: 0.08; motor-mode: position; motor-target: 0; motor-max-speed: 90; motor-max-effort: 18; motor-stiffness: 24; motor-damping: 5'),
  capabilities: RELEASE_C_CAPABILITIES, tolerance: 0.025, impulse: [2.5, 0, 0], motor: { minimum: -60, maximum: 60, initial: 0 },
}];
