import { describe, expect, it } from 'vitest';
import { spatialBaselineRevision } from '../transactions/AccumulativeSpatialTimeline';
import { SpatialSimulationSession } from './SpatialSimulationSession';

const fallingBody = '"Body/+0+1/+10+1/+0+1":"physics-mode: dynamic; can-sleep: false"';
const bodyY = (session: SpatialSimulationSession) => session.frame().document.renderNodes[0].transform.position[1];

describe('application spatial simulation session', () => {
  it('advances gravity while authored input is idle', () => {
    const session = new SpatialSimulationSession(fallingBody); const initial = bodyY(session);
    session.start(); session.advance(1 / 60); session.advance(1 / 60);
    expect(bodyY(session)).toBeLessThan(initial);
  });
  it('does not accrue paused wall time before resume', () => {
    const session = new SpatialSimulationSession(fallingBody); session.start(); session.advance(1 / 60); session.pause();
    const paused = session.frame().tick; expect(session.advance(10)).toBeUndefined();
    session.resume(); session.advance(1 / 60); expect(session.frame().tick).toBe(paused + 1);
  });
  it('produces stable fixed ticks at different render rates', () => {
    const fast = new SpatialSimulationSession(fallingBody); const slow = new SpatialSimulationSession(fallingBody);
    fast.start(); slow.start();
    for (let i = 0; i < 60; i += 1) fast.advance(1 / 60);
    for (let i = 0; i < 20; i += 1) slow.advance(1 / 20);
    expect(fast.frame().tick).toBe(slow.frame().tick); expect(bodyY(fast)).toBeCloseTo(bodyY(slow), 8);
  });
  it('reconstructs playback from its baseline and selected authored frame', () => {
    const revision = spatialBaselineRevision(fallingBody);
    const sought = new SpatialSimulationSession(fallingBody, undefined, revision);
    sought.start(); sought.advance(0.5);
    expect(sought.frame().tick).toBeGreaterThan(0);
    sought.reconstruct(fallingBody);
    expect(sought.frame().tick).toBe(0);

    const fresh = new SpatialSimulationSession(fallingBody, undefined, revision); fresh.start();
    sought.advance(0.1); fresh.advance(0.1);
    expect(sought.frame().tick).toBe(fresh.frame().tick);
    expect(bodyY(sought)).toBeCloseTo(bodyY(fresh), 8);
  });
  it('does not advance when a completed authored frame is reread or recompiled', () => {
    const session = new SpatialSimulationSession(fallingBody); session.start(); session.advance(1 / 60);
    const tick = session.frame().tick; session.setInput(fallingBody); session.setInput(fallingBody);
    expect(session.frame().tick).toBe(tick);
  });
});
