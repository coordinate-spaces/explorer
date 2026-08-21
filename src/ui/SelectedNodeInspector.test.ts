import { describe, expect, it } from 'vitest';
import { rotationDegreesForInspector } from './SelectedNodeInspector';

describe('rotationDegreesForInspector', () => {
  it('preserves fractional degree values in the inspector readout', () => {
    expect(rotationDegreesForInspector([0.5 * Math.PI / 180, 0, -12.25 * Math.PI / 180])).toEqual([0.5, 0, -12.25]);
  });

  it('limits floating-point noise without rounding to whole degrees', () => {
    expect(rotationDegreesForInspector([Math.PI / 3, Math.PI / 2, Math.PI])).toEqual([60, 90, 180]);
    expect(rotationDegreesForInspector([0.12345 * Math.PI / 180])).toEqual([0.123]);
  });
});
