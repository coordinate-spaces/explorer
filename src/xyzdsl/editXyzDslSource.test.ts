import { describe, expect, it } from 'vitest';
import {
  moveDeclarationPath,
  replaceDeclarationPath,
  replaceDeclarationProperties,
  resizeDeclarationPath,
  rotateDeclarationPath,
  updateDeclarationProperty,
  appendProspectiveObjectDeclaration,
} from './editXyzDslSource';

const SOURCE = `"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""`;

describe('editXyzDslSource', () => {
  it('replaces declaration paths and properties without changing surrounding lines', () => {
    expect(replaceDeclarationPath(SOURCE, 2, 'Table/Top/+1d+8d/+4d+1d/+0d+8d')).toBe(
      `"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8"
"Table/Top/+1d+8d/+4d+1d/+0d+8d" : ""`,
    );

    expect(replaceDeclarationProperties(SOURCE, 1, 'color: blue')).toBe(
      `"Table/+18d+8d/+0d+5d/+4d+8d" : "color: blue"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""`,
    );
  });

  it('updates existing properties and appends new properties', () => {
    expect(updateDeclarationProperty(SOURCE, 1, 'metalness', '0.2')).toContain('color: white; metalness: 0.2');
    expect(updateDeclarationProperty(SOURCE, 2, 'geometry', 'cylinder')).toContain('"geometry: cylinder"');
  });

  it('formats movement and resizing canonically to millimetre precision', () => {
    expect(moveDeclarationPath(SOURCE, 1, 'x', 1)).toContain('"Table/+28d+8d/+0+5d/+4d+8d"');
    expect(moveDeclarationPath(SOURCE, 1, 'x', 0.2)).toContain('"Table/+2+8d/+0+5d/+4d+8d"');
    expect(moveDeclarationPath(SOURCE, 1, 'x', 0.001)).toContain('"Table/+1801m+8d/+0+5d/+4d+8d"');
    expect(moveDeclarationPath(SOURCE, 1, 'x', -0.01)).toContain('"Table/+179c+8d/+0+5d/+4d+8d"');
    expect(moveDeclarationPath(SOURCE, 1, 'z', 0.01)).toContain('"Table/+18d+8d/+0+5d/+41c+8d"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -1)).toContain('"Table/+18d+8d/+0+1m/+4d+8d"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', 0.001)).toContain('"Table/+18d+8d/+0+501m/+4d+8d"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', 0.01)).toContain('"Table/+18d+8d/+0+51c/+4d+8d"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -0.01)).toContain('"Table/+18d+8d/+0+49c/+4d+8d"');
    expect(resizeDeclarationPath(SOURCE, 2, 'y', -2)).toContain('"Table/Top/+0+8d/+4d+1m/+0+8d"');
  });

  it('adds and updates rotation properties by axis in degrees', () => {
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15)).toContain('"rotation: 0, 15, 0"');
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15, [0, 90, 0])).toContain('"rotation: 0, 105, 0"');
    const rotatedSource = `"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; rotation: 0, 90, 0"`;
    expect(rotateDeclarationPath(rotatedSource, 1, 'z', -15, [0, 180, 0])).toContain('rotation: 0, 90, -15');
  });

  it('appends a prospective default object at a canonical floor position', () => {
    const result = appendProspectiveObjectDeclaration(SOURCE, [1.05, 0.05, 2.05]);
    expect(result.lineNumber).toBe(3);
    expect(result.source).toContain('"+1+1d/+0+1d/+2+1d" : ""');
  });
});
