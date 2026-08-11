import { describe, expect, it } from 'vitest';
import { SecondaryCameraMotionTracker } from './secondaryCamera';

describe('SecondaryCameraMotionTracker', () => {
  const alice = { streamId: 'alice', cursorNamespace: 'Cursor/' };

  it('uses positive X initially and follows movement direction', () => {
    const tracker = new SecondaryCameraMotionTracker();
    expect(tracker.update(alice, [2, 3, 4])).toEqual({ heading: [1, 0, 0], snap: true });
    expect(tracker.update(alice, [2, 3, 6])).toEqual({ heading: [0, 0, 1], snap: false });
  });

  it('retains the last heading while stationary', () => {
    const tracker = new SecondaryCameraMotionTracker();
    tracker.update(alice, [0, 0, 0]);
    tracker.update(alice, [0, 2, 0]);
    expect(tracker.update(alice, [0, 2, 0]).heading).toEqual([0, 1, 0]);
  });

  it('isolates streams that use the same cursor namespace', () => {
    const tracker = new SecondaryCameraMotionTracker();
    tracker.update(alice, [0, 0, 0]);
    tracker.update(alice, [0, 0, -1]);
    expect(tracker.update({ ...alice, streamId: 'bob' }, [9, 9, 9]).heading).toEqual([1, 0, 0]);
    expect(tracker.update(alice, [0, 0, -1]).heading).toEqual([0, 0, -1]);
  });

  it('requests a snap for large replay or seek discontinuities', () => {
    const tracker = new SecondaryCameraMotionTracker();
    tracker.update(alice, [0, 0, 0]);
    expect(tracker.update(alice, [13, 0, 0], 12).snap).toBe(true);
  });
});
