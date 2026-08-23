import { describe, expect, it } from 'vitest';
import type { XyzDslBoxSpec, XyzDslGeometrySpec } from '../xyzdsl/types';
import { geometryFromBox } from './geometry';

const box: XyzDslBoxSpec = {
  source: '+2d+4d/+7d+6d/+0d+10m',
  x: 2,
  y: 7,
  z: 0,
  width: 4,
  height: 6,
  depth: 0.1,
};

function spec(kind: XyzDslGeometrySpec['kind']): XyzDslGeometrySpec {
  return { kind, diagnostics: [] };
}

describe('geometryFromBox', () => {
  it('derives primitive dimensions from the layout bounding box', () => {
    expect(geometryFromBox(box, spec('cone'))).toEqual({
      kind: 'cone',
      dimensions: [4, 6, 0.1],
    });
  });

  it('preserves box-radius as a box geometry modifier', () => {
    expect(geometryFromBox(box, { ...spec('box'), 'box-radius': 0.15 })).toEqual({
      kind: 'box',
      dimensions: [4, 6, 0.1],
      'box-radius': 0.15,
    });
  });

  it('preserves primitive kinds while using the same bounding-box layout contract', () => {
    expect(geometryFromBox(box, spec('box')).kind).toBe('box');
    expect(geometryFromBox(box, spec('cylinder')).kind).toBe('cylinder');
    expect(geometryFromBox(box, spec('sphere')).kind).toBe('sphere');
  });
});
