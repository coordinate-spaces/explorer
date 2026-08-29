import { describe, expect, it } from 'vitest';
import {
  resizeShortcutForEvent,
  shouldRotateFromWheel,
  toggledLinearStep,
  toggledRotationStep,
  transformStepToggleForEvent,
} from './EditorSelectionControls';

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

describe('transform step shortcuts', () => {
  it('maps bracket keys to linear and rotation toggles', () => {
    expect(transformStepToggleForEvent({ key: '[', ctrlKey: false, metaKey: false, altKey: false })).toBe('linear');
    expect(transformStepToggleForEvent({ key: ']', ctrlKey: false, metaKey: false, altKey: false })).toBe('rotation');
  });

  it('ignores modified and unrelated keys', () => {
    expect(transformStepToggleForEvent({ key: '[', ctrlKey: true, metaKey: false, altKey: false })).toBeUndefined();
    expect(transformStepToggleForEvent({ key: ']', ctrlKey: false, metaKey: true, altKey: false })).toBeUndefined();
    expect(transformStepToggleForEvent({ key: '[', ctrlKey: false, metaKey: false, altKey: true })).toBeUndefined();
    expect(transformStepToggleForEvent({ key: 'a', ctrlKey: false, metaKey: false, altKey: false })).toBeUndefined();
  });

  it('toggles linear choices between fine and coarse, including from auto or an explicit intermediate choice', () => {
    expect(toggledLinearStep('auto')).toBe(0.01);
    expect(toggledLinearStep(0.1)).toBe(0.01);
    expect(toggledLinearStep(0.01)).toBe(1);
    expect(toggledLinearStep(1)).toBe(0.01);
  });

  it('toggles rotation between fine and coarse', () => {
    expect(toggledRotationStep(1)).toBe(15);
    expect(toggledRotationStep(15)).toBe(1);
  });
});
