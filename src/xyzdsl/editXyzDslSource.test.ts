import { describe, expect, it } from 'vitest';
import {
  moveDeclarationPath,
  replaceDeclarationPath,
  replaceDeclarationProperties,
  resizeDeclarationPath,
  rotateDeclarationPath,
  updateDeclarationProperty,
} from './editXyzDslSource';

const SOURCE = `"Table/+18+8/+0+5/+4+8" : "color: white; metalness: 0.8"
"Table/Top/+0+8/+4+1/+0+8" : ""`;

describe('editXyzDslSource', () => {
  it('replaces declaration paths and properties without changing surrounding lines', () => {
    expect(replaceDeclarationPath(SOURCE, 2, 'Table/Top/+1+8/+4+1/+0+8')).toBe(
      `"Table/+18+8/+0+5/+4+8" : "color: white; metalness: 0.8"
"Table/Top/+1+8/+4+1/+0+8" : ""`,
    );

    expect(replaceDeclarationProperties(SOURCE, 1, 'color: blue')).toBe(
      `"Table/+18+8/+0+5/+4+8" : "color: blue"
"Table/Top/+0+8/+4+1/+0+8" : ""`,
    );
  });

  it('updates existing properties and appends new properties', () => {
    expect(updateDeclarationProperty(SOURCE, 1, 'metalness', '0.2')).toContain('color: white; metalness: 0.2');
    expect(updateDeclarationProperty(SOURCE, 2, 'geometry', 'cylinder')).toContain('"geometry: cylinder"');
  });

  it('moves and resizes path axes using unit, centimeter, and millimeter notation', () => {
    expect(moveDeclarationPath(SOURCE, 1, 'x', 1)).toContain('"Table/+19+8/+0+5/+4+8"');
    expect(moveDeclarationPath(SOURCE, 1, 'x', -0.01)).toContain('"Table/+1799m+8/+0+5/+4+8"');
    expect(moveDeclarationPath(SOURCE, 1, 'z', 0.01)).toContain('"Table/+18+8/+0+5/+401m+8"');
    expect(moveDeclarationPath(SOURCE, 1, 'z', -3.9)).toContain('"Table/+18+8/+0+5/+1c+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -1)).toContain('"Table/+18+8/+0+4/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', 0.01)).toContain('"Table/+18+8/+0+501m/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -0.01)).toContain('"Table/+18+8/+0+499m/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 2, 'y', -2)).toContain('"Table/Top/+0+8/+4+1m/+0+8"');
  });

  it('adds and updates rotation properties by axis in degrees', () => {
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15)).toContain('"rotation: 0, 15, 0"');
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15, [0, 90, 0])).toContain('"rotation: 0, 105, 0"');
    const rotatedSource = `"Table/+18+8/+0+5/+4+8" : "color: white; rotation: 0, 90, 0"`;
    expect(rotateDeclarationPath(rotatedSource, 1, 'z', -15, [0, 180, 0])).toContain('rotation: 0, 90, -15');
  });
});
