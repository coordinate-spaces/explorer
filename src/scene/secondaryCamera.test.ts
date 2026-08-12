import { describe, expect, it } from 'vitest';
import {
  constrainPointOutsideBounds,
  forwardBoundsExit,
  SecondaryCameraMotionTracker,
} from './secondaryCamera';

describe('forwardBoundsExit', () => {
  const box = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };

  it('places a box camera beyond its forward face', () => {
    expect(forwardBoundsExit(box, [1, 0, 0], 0.05)).toEqual([1.05, 0, 0]);
  });

  it('uses the first intersected face for nonuniform dimensions', () => {
    const bounds = { minX: 2, maxX: 10, minY: -2, maxY: 2, minZ: 4, maxZ: 6 };
    expect(forwardBoundsExit(bounds, [0, 0, 1], 0.1)).toEqual([6, 0, 6.1]);
  });

  it('finds the nearest face along a diagonal heading', () => {
    const heading = [Math.SQRT1_2, Math.SQRT1_2, 0] as const;
    const result = forwardBoundsExit(
      { minX: -2, maxX: 2, minY: -1, maxY: 1, minZ: -3, maxZ: 3 },
      [...heading],
      0.1,
    );
    expect(result[0]).toBeCloseTo(1.070710678);
    expect(result[1]).toBeCloseTo(1.070710678);
    expect(result[2]).toBe(0);
  });

  it('handles zero-size axes and a zero heading deterministically', () => {
    const flat = { minX: 3, maxX: 3, minY: 1, maxY: 5, minZ: -1, maxZ: 1 };
    expect(forwardBoundsExit(flat, [1, 0, 0], 0.05)).toEqual([3.05, 3, 0]);
    expect(forwardBoundsExit(flat, [0, 0, 0], 0.05)).toEqual([3.05, 3, 0]);
  });

  it('always puts a positive-margin result outside the bounds', () => {
    const result = forwardBoundsExit(box, [0.6, 0, 0.8], 0.02);
    const inside = result[0] >= box.minX && result[0] <= box.maxX
      && result[1] >= box.minY && result[1] <= box.maxY
      && result[2] >= box.minZ && result[2] <= box.maxZ;
    expect(inside).toBe(false);
  });
});

describe('constrainPointOutsideBounds', () => {
  const movedBox = { minX: -0.4, maxX: 0.6, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 };

  it('keeps an ordinary smoothed update outside the current cursor bounds', () => {
    const oldCamera = [0.55, 0.1, 0] as [number, number, number];
    const desired = [0.65, 0.2, 0] as [number, number, number];
    const smoothed = oldCamera.map((component, axis) => (
      component + (desired[axis] - component) * 0.1
    )) as [number, number, number];

    const constrained = constrainPointOutsideBounds(smoothed, movedBox, desired);
    expect(constrained[0]).toBe(0.65);
    expect(constrained[1]).toBeCloseTo(0.11);
    expect(constrained[2]).toBe(0);
  });

  it('does not disturb a smoothed point that is already outside', () => {
    expect(constrainPointOutsideBounds([0.61, 0.1, 0], movedBox, [0.65, 0.2, 0])).toEqual([0.61, 0.1, 0]);
  });
});

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
    expect(tracker.snapshot(alice).discontinuity).toBe(1);
  });

  it('retains history before the cursor is selected as a camera', () => {
    const tracker = new SecondaryCameraMotionTracker();
    tracker.update(alice, [4, 0, 4]);
    tracker.update(alice, [4, 0, 6]);
    expect(tracker.heading(alice)).toEqual([0, 0, 1]);
  });

  it('derives seam-crossing direction from unwrapped samples', () => {
    const tracker = new SecondaryCameraMotionTracker();
    tracker.update(alice, [39, 0, 0]);
    expect(tracker.update(alice, [41, 0, 0])).toEqual({ heading: [1, 0, 0], snap: false });
  });
});
