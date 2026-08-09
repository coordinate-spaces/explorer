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

  it('moves and resizes path axes using unit and centiunit notation', () => {
    expect(moveDeclarationPath(SOURCE, 1, 'x', 1)).toContain('"Table/+19+8/+0+5/+4+8"');
    expect(moveDeclarationPath(SOURCE, 1, 'x', -0.01)).toContain('"Table/+1799c+8/+0+5/+4+8"');
    expect(moveDeclarationPath(SOURCE, 1, 'z', 0.01)).toContain('"Table/+18+8/+0+5/+401c+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -1)).toContain('"Table/+18+8/+0+4/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', 0.01)).toContain('"Table/+18+8/+0+501c/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 1, 'y', -0.01)).toContain('"Table/+18+8/+0+499c/+4+8"');
    expect(resizeDeclarationPath(SOURCE, 2, 'y', -2)).toContain('"Table/Top/+0+8/+4+1c/+0+8"');
  });

  it('wraps X and Z movement within the current coordinate space while clamping Y', () => {
    const space = { width: 40, depth: 50, height: 28 };
    const origin = `"Thing/+0+1/+0+1/+0+1" : ""`;
    expect(moveDeclarationPath(origin, 1, 'x', -0.01, space)).toContain('+3999c+1/+0+1/+0+1');
    expect(moveDeclarationPath(origin, 1, 'z', -1, space)).toContain('+0+1/+0+1/+49+1');
    expect(moveDeclarationPath(origin, 1, 'y', -1, space)).toBe(origin);
    expect(moveDeclarationPath(origin, 1, 'x', 81, space)).toContain('+1+1/+0+1/+0+1');
  });

  it('adds and updates rotation properties by axis in degrees', () => {
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15)).toContain('"rotation: 0, 15, 0"');
    expect(rotateDeclarationPath(SOURCE, 2, 'y', 15, [0, 90, 0])).toContain('"rotation: 0, 105, 0"');
    const rotatedSource = `"Table/+18+8/+0+5/+4+8" : "color: white; rotation: 0, 90, 0"`;
    expect(rotateDeclarationPath(rotatedSource, 1, 'z', -15, [0, 180, 0])).toContain('rotation: 0, 90, -15');
  });
});
