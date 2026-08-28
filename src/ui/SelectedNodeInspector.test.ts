import { describe, expect, it } from 'vitest';
import { rotationDegreesForInspector, transformDeltaForDirectValue } from './SelectedNodeInspector';
import type { SpatialNode } from '../model/SpatialNode';
import { linearTransformStepForNode } from '../model/transformStep';

describe('rotationDegreesForInspector', () => {
  it('preserves fractional degree values in the inspector readout', () => {
    expect(rotationDegreesForInspector([0.5 * Math.PI / 180, 0, -12.25 * Math.PI / 180])).toEqual([0.5, 0, -12.25]);
  });

  it('limits floating-point noise without rounding to whole degrees', () => {
    expect(rotationDegreesForInspector([Math.PI / 3, Math.PI / 2, Math.PI])).toEqual([60, 90, 180]);
    expect(rotationDegreesForInspector([0.12345 * Math.PI / 180])).toEqual([0.123]);
  });
});

describe('linearTransformStepForNode', () => {
  const node = (size: number) => ({ box: { width: size, height: size, depth: size } }) as SpatialNode;
  it('adapts from millimetre objects through large scene objects', () => {
    expect(linearTransformStepForNode(node(0.001))).toBe(0.001);
    expect(linearTransformStepForNode(node(1))).toBe(0.1);
    expect(linearTransformStepForNode(node(100))).toBe(10);
  });
});

describe('transformDeltaForDirectValue', () => {
  it('converts an absolute inspector entry into a transform delta', () => {
    expect(transformDeltaForDirectValue(1.25, '2.5')).toBe(1.25);
    expect(transformDeltaForDirectValue(90, '-45')).toBe(-135);
  });

  it('ignores empty and invalid entries', () => {
    expect(transformDeltaForDirectValue(1, '')).toBeUndefined();
    expect(transformDeltaForDirectValue(1, 'not-a-number')).toBeUndefined();
  });
});
