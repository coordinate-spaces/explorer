import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { PhysicsWorld } from './PhysicsWorld';
import { compileArticulatedPhysicsScene } from './compilePhysicsScene';
import { RELEASE_B_PASSIVE_CAPABILITIES, RELEASE_C_ACTIVE_CAPABILITIES } from './articulationCapabilities';
import { SimulationTimeline } from '../transactions/SimulationTimeline';
import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';

const passive = [
  '"Machine/+0+1/+0+1/+0+1":""',
  '"Machine/Frame/+0+1/+0+1/+0+1":"body: Frame; physics-mode: static"',
  '"Machine/Arm/+0+1/+1+2/+0+1":"body: Arm; joint: revolute; joint-parent: Machine/Frame/; joint-anchor: 0 1 0; joint-axis: 0 0 1; joint-damping: .2"',
].join('\n');
const motor = passive.replace('joint-damping: .2"', 'joint-damping: .2; motor-mode: position; motor-target: 30; motor-max-speed: 90; motor-max-effort: 10"');

describe('articulation capability profiles', () => {
  it('uses identical bodies and passive joints in Release B and C', () => {
    const b = compileArticulatedPhysicsScene(createSpatialDocument(passive), 'same', RELEASE_B_PASSIVE_CAPABILITIES);
    const c = compileArticulatedPhysicsScene(createSpatialDocument(passive), 'same', RELEASE_C_ACTIVE_CAPABILITIES);
    expect(b).toEqual(c);
  });

  it('diagnoses and strips a requested motor in Release B', () => {
    const document = createSpatialDocument(motor);
    const scene = compileArticulatedPhysicsScene(document, 'motor', RELEASE_B_PASSIVE_CAPABILITIES);
    expect(scene.joints).toHaveLength(1);
    expect(scene.joints[0]!.motor).toBeUndefined();
    expect(document.diagnostics.map(({ message }) => message)).toContainEqual(expect.stringContaining('rejects motor properties'));
  });

  it('installs and runs a requested motor in Release C', () => {
    const session = new SpatialSimulationSession(motor, undefined, 'motor', RELEASE_C_ACTIVE_CAPABILITIES);
    expect(session.timeline.simulation.world.snapshot().joints?.[0]?.motor).toMatchObject({ mode: 'position' });
    session.start();
    expect(() => session.advance(1 / 30)).not.toThrow();
    session.dispose();
  });

  it('rejects joint inputs through the lower-level timeline API in Release B', () => {
    const timeline = new SimulationTimeline(new PhysicsWorld(), RELEASE_B_PASSIVE_CAPABILITIES);
    expect(() => timeline.enqueueInputs([{ kind: 'joint-effort', jointId: 'joint:arm', tick: 1, value: 1 }]))
      .toThrow(/rejects joint-addressed motor inputs/);
  });

  it('reconstructing with another UI profile cannot retain active motor state', () => {
    const active = new SpatialSimulationSession(motor, undefined, 'selection', RELEASE_C_ACTIVE_CAPABILITIES);
    active.timeline.simulation.enqueueInputs([{ kind: 'joint-effort', jointId: 'joint:component:Machine/body:Arm', tick: 1, value: 2 }]);
    active.dispose();
    const passiveSession = new SpatialSimulationSession(motor, undefined, 'selection', RELEASE_B_PASSIVE_CAPABILITIES);
    expect(passiveSession.timeline.simulation.world.tick).toBe(0);
    expect(passiveSession.timeline.simulation.world.snapshot().joints?.[0]?.motor).toBeUndefined();
    passiveSession.dispose();
  });
});
