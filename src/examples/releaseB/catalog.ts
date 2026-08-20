import { RELEASE_B_CAPABILITIES } from '../../physics/articulationCapabilities';
import { defaultTolerances, fixedSource, hingeSource, passivePendulumSource, prismaticSource, sphericalSource, twoLinkSource, type ArticulationFixture } from '../fixtures';

const fixture = (value: Omit<ArticulationFixture, 'capabilities' | 'ticks' | 'snapshotTicks' | 'tolerances' | 'expectedTransitions'>): ArticulationFixture => ({
  ...value, capabilities: RELEASE_B_CAPABILITIES, ticks: 90, snapshotTicks: [30], tolerances: defaultTolerances,
  expectedTransitions: { enter: 0, stay: 0, leave: 0 },
});

export const RELEASE_B_FIXTURES: readonly ArticulationFixture[] = [
  fixture({ id: 'passive-pendulum', title: 'Passive revolute pendulum', description: 'Gravity and an impulse swing a passive hinge.', source: passivePendulumSource, control: 'impulse', inputs: [{ tick: 10, kind: 'child-impulse', vector: [2.5, 0, 0] }], expectedJointKinds: ['revolute'] }),
  fixture({ id: 'limited-door', title: 'Limited door', description: 'A passive door remains inside authored angular stops.', source: hingeSource('Door', { limits: '-35 35' }), control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', vector: [4, 0, 0] }], expectedJointKinds: ['revolute'] }),
  fixture({ id: 'fixed-assembly', title: 'Fixed assembly', description: 'A welded beam retains its parent-relative transform.', source: fixedSource, inputs: [], expectedJointKinds: ['fixed'] }),
  fixture({ id: 'prismatic-drawer', title: 'Prismatic drawer', description: 'A drawer moves only along its rail axis.', source: prismaticSource, control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', vector: [1, 0, 0] }], expectedJointKinds: ['prismatic'] }),
  fixture({ id: 'spherical-load', title: 'Spherical load', description: 'A ball-and-socket load preserves its common pivot.', source: sphericalSource, control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', vector: [1, 0, 0] }], expectedJointKinds: ['spherical'] }),
  fixture({ id: 'two-link-pendulum', title: 'Two-link pendulum', description: 'Two stable revolute joints form a passive chain.', source: twoLinkSource, control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', jointIndex: 1, vector: [1.5, 0, 0] }], expectedJointKinds: ['revolute', 'revolute'] }),
  fixture({ id: 'reconcile-while-swinging', title: 'Reconcile while swinging', description: 'An unrelated authored edit preserves a moving articulation.', source: passivePendulumSource, control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', vector: [2, 0, 0] }], expectedJointKinds: ['revolute'] }),
  fixture({ id: 'snapshot-restore-replay', title: 'Snapshot / restore / replay', description: 'Exact timeline tick seeking reproduces pose and velocity.', source: passivePendulumSource, control: 'impulse', inputs: [{ tick: 5, kind: 'child-impulse', vector: [2, 0, 0] }], expectedJointKinds: ['revolute'] }),
];
