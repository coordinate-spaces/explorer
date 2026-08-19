import { RELEASE_B_CAPABILITIES } from '../../physics/articulationCapabilities';
import { passivePendulumSource, type ArticulationFixture } from '../fixtures';

export const RELEASE_B_FIXTURES: readonly ArticulationFixture[] = [{
  id: 'passive-pendulum', title: 'Passive pendulum',
  description: 'Gravity, impulses, limits, snapshots, and replay—with every active capability disabled.',
  source: passivePendulumSource, capabilities: RELEASE_B_CAPABILITIES, tolerance: 0.025, impulse: [2.5, 0, 0],
}];
