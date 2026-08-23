import { describe, expect, it } from 'vitest';
import {
  CENTIMETRES_PER_UNIT,
  DECIMETRES_PER_UNIT,
  METERS_PER_UNIT,
  MILLIMETRES_PER_UNIT,
  UNIT_SCALE_DESCRIPTION,
} from './units';

describe('project unit scale', () => {
  it('defines metre, decimetre, centimetre, and millimetre conversions', () => {
    expect(METERS_PER_UNIT).toBe(1);
    expect(DECIMETRES_PER_UNIT).toBe(10);
    expect(CENTIMETRES_PER_UNIT).toBe(100);
    expect(MILLIMETRES_PER_UNIT).toBe(1000);
    expect(UNIT_SCALE_DESCRIPTION).toBe('1 unit = 1 m; 1d = 1 dm; 1c = 1 cm; 1m = 1 mm');
  });
});
