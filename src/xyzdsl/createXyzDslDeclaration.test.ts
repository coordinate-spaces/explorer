import { describe, expect, it } from 'vitest';
import { DEFAULT_SPATIAL_CURSOR } from '../cursor/spatialCursor';
import { createXyzDslDeclaration, formatXyzDslPathNumber, spatialCursorNamespaceError } from './createXyzDslDeclaration';

describe('createXyzDslDeclaration', () => {
  it('serializes anonymous and named cursor drafts', () => {
    expect(createXyzDslDeclaration(DEFAULT_SPATIAL_CURSOR)).toContain('"+0+2d/+0+2d/+0+2d"');
    expect(createXyzDslDeclaration({ ...DEFAULT_SPATIAL_CURSOR, named: true, namespace: 'Chair/Seat' }))
      .toContain('"Chair/Seat/+0+2d/+0+2d/+0+2d"');
  });

  it('uses exact metric suffixes and validates names', () => {
    expect(formatXyzDslPathNumber(0.013)).toBe('13m');
    expect(spatialCursorNamespaceError({ ...DEFAULT_SPATIAL_CURSOR, named: true, namespace: 'bad name' })).toBeTruthy();
  });
});
