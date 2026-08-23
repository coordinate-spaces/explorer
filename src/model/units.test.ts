import { describe, expect, it } from 'vitest';
import {
  CENTIMETERS_PER_UNIT,
  METERS_PER_CENTIMETER,
  METERS_PER_MILLIMETER,
  METERS_PER_UNIT,
  MILLIMETERS_PER_UNIT,
  UNIT_SCALE_DESCRIPTION,
} from './units';

describe('project unit scale', () => {
  it('defines explicit centimeter and millimeter scales for 10 cm project units', () => {
    expect(CENTIMETERS_PER_UNIT).toBe(10);
    expect(MILLIMETERS_PER_UNIT).toBe(100);
    expect(METERS_PER_UNIT).toBe(0.1);
    expect(METERS_PER_CENTIMETER).toBe(0.01);
    expect(METERS_PER_MILLIMETER).toBe(0.001);
    expect(UNIT_SCALE_DESCRIPTION).toBe('1 unit = 10 cm; 1c = 1 cm; 1m = 1 mm');
  });
});
