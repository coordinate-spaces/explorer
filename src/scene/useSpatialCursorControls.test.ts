import { describe, expect, it } from 'vitest';
import { CURSOR_KEYS } from './useSpatialCursorControls';

describe('spatial cursor input mapping', () => {
  it('maps paired movement keys to opposite local axes', () => {
    expect(CURSOR_KEYS.KeyA).toEqual({ axis: 0, direction: -1 });
    expect(CURSOR_KEYS.KeyD).toEqual({ axis: 0, direction: 1 });
    expect(CURSOR_KEYS.KeyQ).toEqual({ axis: 1, direction: -1 });
    expect(CURSOR_KEYS.KeyE).toEqual({ axis: 1, direction: 1 });
    expect(CURSOR_KEYS.KeyS).toEqual({ axis: 2, direction: -1 });
    expect(CURSOR_KEYS.KeyW).toEqual({ axis: 2, direction: 1 });
  });
});
