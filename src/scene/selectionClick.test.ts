import { describe, expect, it } from 'vitest';
import { shouldSelectFromClick } from './selectionClick';

describe('shouldSelectFromClick', () => {
  it('selects for a macOS-style Cmd-click', () => {
    expect(shouldSelectFromClick(true, { metaKey: true, ctrlKey: false })).toBe(true);
  });

  it('selects for a Windows/Linux-style Ctrl-click', () => {
    expect(shouldSelectFromClick(true, { metaKey: false, ctrlKey: true })).toBe(true);
  });

  it('does not select for an unmodified click', () => {
    expect(shouldSelectFromClick(true, { metaKey: false, ctrlKey: false })).toBe(false);
  });

  it('does not select when selection is disabled', () => {
    expect(shouldSelectFromClick(false, { metaKey: true, ctrlKey: true })).toBe(false);
  });
});
