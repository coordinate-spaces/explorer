import { describe, expect, it } from 'vitest';
import { spatialBaselineRevision } from '../transactions/AccumulativeSpatialTimeline';
import { SpatialSimulationSession } from './SpatialSimulationSession';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';

const fallingBody = '"Body/+0+1/+10+1/+0+1":"physics-mode: dynamic; can-sleep: false"';
const bodyY = (session: SpatialSimulationSession) => session.frame().document.renderNodes[0].transform.position[1];

const contactSource = (cursorX: number) => [
  '"Target/+0+2/+0+2/+0+2":"physics-mode: static"',
  `"Cursor/+${cursorX}+1/+0+1/+0+1":""`,
].join('\n');
const contactOrigins = () => new Map<number, XyzDslDeclarationOrigin>([
  [1, { sourceKind: 'baseline' }],
  [2, { sourceKind: 'secondary', streamId: 'local-cursor' }],
]);

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
    const tick = session.frame().tick;
    const published = session.frame();
    expect(session.setInput(fallingBody)).toBe(published);
    expect(session.setInput(fallingBody)).toBe(published);
    expect(session.frame().tick).toBe(tick);
  });

  it('keeps a stationary cursor in contact queries while fixed steps continue', () => {
    const origins = contactOrigins();
    const session = new SpatialSimulationSession(contactSource(1), origins);
    session.start();

    session.advance(1 / 60);
    const first = session.frame().document.interactions?.find(({ streamId }) => streamId === 'local-cursor');
    session.advance(1 / 15);
    const later = session.frame().document.interactions?.find(({ streamId }) => streamId === 'local-cursor');

    expect(first?.state).toBeDefined();
    expect(later?.state).toBe(first?.state);
    expect(session.frame().tick).toBe(5);
  });

  it('reconciles cursor movement as authored kinematic input without adding physics ticks', () => {
    const origins = contactOrigins();
    const moved = new SpatialSimulationSession(contactSource(1), origins);
    const idle = new SpatialSimulationSession(contactSource(1), origins);
    moved.start(); idle.start();
    moved.advance(1 / 30); idle.advance(1 / 30);
    const tickBeforeMovement = moved.frame().tick;

    moved.setInput(contactSource(4), origins);
    expect(moved.frame().tick).toBe(tickBeforeMovement);
    expect(moved.frame().document.renderNodes.find(({ origin }) => origin?.sourceKind === 'secondary')?.box.x).toBe(4);

    moved.advance(1 / 10); idle.advance(1 / 10);
    expect(moved.frame().tick).toBe(idle.frame().tick);
  });

  it('continues through idle updates and stops only while explicitly paused or disposed', () => {
    const session = new SpatialSimulationSession(fallingBody);
    session.start();
    session.advance(1 / 30);
    const runningTick = session.frame().tick;
    session.advance(1 / 30);
    expect(session.frame().tick).toBeGreaterThan(runningTick);

    session.pause();
    const pausedTick = session.frame().tick;
    expect(session.advance(1)).toBeUndefined();
    expect(session.frame().tick).toBe(pausedTick);

    session.resume();
    session.advance(1 / 60);
    expect(session.frame().tick).toBe(pausedTick + 1);

    session.dispose();
    const stoppedTick = session.frame().tick;
    expect(session.advance(1)).toBeUndefined();
    expect(session.frame().tick).toBe(stoppedTick);
  });
});
