import { RELEASE_C_CAPABILITIES } from '../../physics/articulationCapabilities';
import { defaultTolerances, hingeSource, type ArticulationFixture, type ExampleControl } from '../fixtures';

const motors = {
  position: 'motor-mode: position; motor-target: 0; motor-max-speed: 90; motor-max-effort: 18; motor-stiffness: 24; motor-damping: 5',
  velocity: 'motor-mode: velocity; motor-velocity: 0; motor-max-speed: 180; motor-max-effort: 12; motor-damping: 2',
  effort: 'motor-mode: effort; motor-max-speed: 180; motor-max-effort: 10; motor-damping: 1',
};
const fixture = (id: string, title: string, description: string, mode: keyof typeof motors, control: ExampleControl, input: ArticulationFixture['inputs'], options: { obstacle?: boolean; weak?: boolean; convergence?: boolean } = {}): ArticulationFixture => ({
  id, title, description, source: hingeSource(id.replace(/[^A-Za-z0-9]/g, ''), { obstacle: options.obstacle, motor: options.weak ? motors.position.replace('motor-max-effort: 18', 'motor-max-effort: .15') : motors[mode] }),
  capabilities: RELEASE_C_CAPABILITIES, ticks: 90, inputs: input, snapshotTicks: [30], expectedTransitions: { enter: 0, stay: 0, leave: 0 },
  expectedJointKinds: ['revolute'], control, tolerances: { ...defaultTolerances, maximumSpeed: Math.PI + .1, maximumAppliedEffort: options.weak ? .15 : mode === 'position' ? 18 : mode === 'velocity' ? 12 : 10 },
  motor: { minimum: mode === 'position' ? -60 : -3, maximum: mode === 'position' ? 60 : mode === 'effort' ? 10 : 3, initial: 0, unit: mode === 'position' ? 'deg' : mode === 'velocity' ? 'rad/s' : 'N·m' }, expectTargetConvergence: options.convergence ?? (mode === 'position' && !options.obstacle && !options.weak),
});

export const RELEASE_C_FIXTURES: readonly ArticulationFixture[] = [
  fixture('position-controlled-door', 'Position-controlled door', 'A bounded servo requests and physically approaches an angle.', 'position', 'position', [{ tick: 1, kind: 'joint-position-target', value: .45 }], { convergence: false }),
  fixture('velocity-controlled-wheel', 'Velocity-controlled wheel', 'A velocity controller requests angular speed without teleporting.', 'velocity', 'velocity', [{ tick: 1, kind: 'joint-velocity-target', value: 1 }]),
  fixture('effort-controlled-lever', 'Effort-controlled lever', 'A direct bounded effort accelerates a lever through physics.', 'effort', 'effort', [{ tick: 1, kind: 'joint-effort', value: 5 }]),
  fixture('insufficient-effort', 'Motor under insufficient effort', 'A weak motor visibly retains target error.', 'position', 'position', [{ tick: 1, kind: 'joint-position-target', value: .8 }], { weak: true, convergence: false }),
  fixture('blocked-door', 'Door blocked by obstacle', 'A collider obstructs the driven panel instead of allowing a teleport.', 'position', 'position', [{ tick: 1, kind: 'joint-position-target', value: .8 }], { obstacle: true, convergence: false }),
  fixture('touch-actuated-lever', 'Touch-actuated lever', 'Touch-style actuation emits a bounded effort command.', 'effort', 'touch', [{ tick: 10, kind: 'joint-effort', value: 5 }]),
  fixture('direct-finger-joint', 'Directly controlled finger joint', 'A direct joint-addressed position command drives the finger.', 'position', 'direct', [{ tick: 1, kind: 'joint-position-target', value: .35 }], { convergence: false }),
  fixture('competing-controllers', 'Two controllers competing for one joint', 'Priority resolution produces one physical command for the joint.', 'position', 'competing', [{ tick: 1, kind: 'joint-position-target', value: -.5, controllerPriority: 1 }, { tick: 1, kind: 'joint-position-target', value: .4, controllerPriority: 2, exclusive: true }], { convergence: false }),
  fixture('motor-snapshot-replay', 'Motor snapshot / restore / replay', 'Timeline snapshots retain active motor state for exact replay.', 'position', 'position', [{ tick: 1, kind: 'joint-position-target', value: .5 }], { convergence: false }),
];
