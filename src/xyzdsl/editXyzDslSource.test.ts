import { describe, expect, it } from 'vitest';
import {
  applyDeclarationPose,
  moveDeclarationPath,
  replaceDeclarationPath,
  replaceDeclarationProperties,
  resizeDeclarationPath,
  rotateDeclarationPath,
  updateDeclarationProperty,
} from './editXyzDslSource';

const SOURCE = `"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""`;

describe('editXyzDslSource', () => {
  it('atomically commits rendered-center position and rotation while preserving declaration text', () => {
    const source = `  "Room/Chair/+1+2/+2+4/+3+6" : "color: red; rotate: 1, 2, 3; custom: yes"  `;
    expect(applyDeclarationPose(source, 1, { position: [2.2346, 3, 4], rotation: [0, Math.PI / 2, -Math.PI / 4] })).toBe(
      `  "Room/Chair/+1235m+2/+1+4/+1+6" : "color: red; rotate: 0, 90, -45; custom: yes"  `,
    );
  });

  it('clamps lower edges, adds an explicit inherited pose, and rejects unsupported lines', () => {
    const source = `"Parent/Child/+1+2/+1+2/+1+2" : "color: blue"`;
    expect(applyDeclarationPose(source, 1, { position: [-5, 0.25, 0.0004], rotation: [Math.PI / 6, 0, 0] }))
      .toBe(`"Parent/Child/+0+2/+0+2/+0+2" : "color: blue; rotation: 30, 0, 0"`);
    expect(applyDeclarationPose('not a declaration', 1, { position: [1, 1, 1], rotation: [0, 0, 0] })).toBe('not a declaration');
  });
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
});
