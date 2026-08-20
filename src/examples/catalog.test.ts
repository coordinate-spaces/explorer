import { describe, expect, it } from 'vitest';
import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';
import { RELEASE_B_CAPABILITIES, RELEASE_C_CAPABILITIES } from '../physics/articulationCapabilities';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import { dynamicStateDivergence } from './ArticulationGallery';
import type { PhysicsSnapshot } from '../physics/types';

describe('browser articulation catalogs', () => {
  it('pins every fixture to its release capabilities and production session', () => {
    expect(RELEASE_B_FIXTURES).toHaveLength(8);
    expect(RELEASE_C_FIXTURES).toHaveLength(9);
    expect(RELEASE_B_FIXTURES.every(({ capabilities }) => capabilities === RELEASE_B_CAPABILITIES)).toBe(true);
    expect(RELEASE_C_FIXTURES.every(({ capabilities }) => capabilities === RELEASE_C_CAPABILITIES)).toBe(true);
    for (const fixture of [...RELEASE_B_FIXTURES, ...RELEASE_C_FIXTURES]) {
      const session = new SpatialSimulationSession(fixture.source, undefined, fixture.id, fixture.capabilities);
      expect(session.capabilities).toBe(fixture.capabilities);
      expect(session.timeline.simulation.world.snapshot().joints?.map(({ kind }) => kind)).toEqual(fixture.expectedJointKinds);
      session.dispose();
    }
  });

  it('keeps Release B passive and gives Release C a bounded motor', () => {
    const passive = new SpatialSimulationSession(RELEASE_B_FIXTURES[0].source, undefined, 'b', RELEASE_B_CAPABILITIES);
    const active = new SpatialSimulationSession(RELEASE_C_FIXTURES[0].source, undefined, 'c', RELEASE_C_CAPABILITIES);
    expect(passive.timeline.simulation.world.snapshot().joints?.[0]?.motor).toBeUndefined();
    expect(active.timeline.simulation.world.snapshot().joints?.[0]?.motor).toMatchObject({ maxSpeed: Math.PI / 2, maxEffort: 18 });
    passive.dispose(); active.dispose();
  });

  it('measures replay divergence across dynamic pose and velocity by stable ID', () => {
    const session = new SpatialSimulationSession(RELEASE_B_FIXTURES[0].source, undefined, 'divergence', RELEASE_B_CAPABILITIES);
    const expected = session.timeline.simulation.world.snapshot();
    const dynamic = expected.states.find((state) => expected.definitions.find(({ id }) => id === state.id)?.mode !== 'static')!;
    const changed: PhysicsSnapshot = { ...expected, states: expected.states.map((state) => state.id === dynamic.id
      ? { ...state, angularVelocity: [state.angularVelocity[0], state.angularVelocity[1], state.angularVelocity[2] + 0.5] }
      : state) };
    expect(dynamicStateDivergence(expected, changed)).toBe(0.5);
    expect(dynamicStateDivergence(expected, { ...changed, states: changed.states.filter(({ id }) => id !== dynamic.id) })).toBe(Infinity);
    session.dispose();
  });
});
