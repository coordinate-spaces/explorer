import { describe, expect, it } from 'vitest';
import { resizeShortcutForEvent, shouldRotateFromWheel } from './EditorSelectionControls';

describe('resizeShortcutForEvent', () => {
  it.each(['x', 'y', 'z'] as const)('increases only the %s axis with Ctrl/Command+axis', (axis) => {
    expect(resizeShortcutForEvent({ key: axis, ctrlKey: true, metaKey: false, shiftKey: false })).toEqual({
      axes: [axis], deltaDirection: 1,
    });
    expect(resizeShortcutForEvent({ key: axis.toUpperCase(), ctrlKey: false, metaKey: true, shiftKey: false })).toEqual({
      axes: [axis], deltaDirection: 1,
    });
  });

  it.each(['x', 'y', 'z'] as const)('decreases only the %s axis when Shift is also held', (axis) => {
    expect(resizeShortcutForEvent({ key: axis, ctrlKey: true, metaKey: false, shiftKey: true })).toEqual({
      axes: [axis], deltaDirection: -1,
    });
  });

  it('retains uniform positive and negative resize shortcuts', () => {
    expect(resizeShortcutForEvent({ key: '=', ctrlKey: true, metaKey: false, shiftKey: false })).toEqual({ axes: ['x', 'y', 'z'], deltaDirection: 1 });
    expect(resizeShortcutForEvent({ key: '+', ctrlKey: false, metaKey: true, shiftKey: true })).toEqual({ axes: ['x', 'y', 'z'], deltaDirection: 1 });
    expect(resizeShortcutForEvent({ key: '-', ctrlKey: true, metaKey: false, shiftKey: false })).toEqual({ axes: ['x', 'y', 'z'], deltaDirection: -1 });
  });

  it('ignores resize keys without Ctrl or Command', () => {
    expect(resizeShortcutForEvent({ key: 'x', ctrlKey: false, metaKey: false, shiftKey: false })).toBeUndefined();
    expect(resizeShortcutForEvent({ key: '+', ctrlKey: false, metaKey: false, shiftKey: true })).toBeUndefined();
  });
});

describe('shouldRotateFromWheel', () => {
  it('requires a physical Ctrl or Command keydown activation', () => {
    expect(shouldRotateFromWheel(false)).toBe(false);
    expect(shouldRotateFromWheel(true)).toBe(true);
  });
});
