import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createCursorDeclaration } from '../xyzdsl/editXyzDslSource';
import { cursorCoordinatePath, INITIAL_LOCAL_CURSOR, moveLocalCursor } from './localCursor';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { createCursorPreviewDocument, cursorClippingPlanes } from './cursorPreview';

describe('local cursor', () => {
  it('moves in the selected XYZDSL unit and respects the scene boundary', () => {
    const moved = moveLocalCursor({ ...INITIAL_LOCAL_CURSOR, unit: 'mm' }, [1, -1, 0]);
    expect(moved.position).toEqual([0.001, 0, 0]);
  });

  it('shows canonical mixed-unit coordinates', () => {
    expect(cursorCoordinatePath([1, 0.2, 0.003], [0.1, 0.01, 0.001])).toBe('+1+1d/+2d+1c/+3m+1m');
  });

  it('serializes anonymous and named previews without separate coordinate properties', () => {
    expect(createCursorDeclaration({
      position: [1, 0.2, 0.003],
      size: [0.1, 0.1, 0.1],
      namespace: 'Room/Probe',
      properties: { geometry: 'sphere', color: 'blue' },
    })).toBe('"Room/Probe/+1+1d/+2d+1d/+3m+1d" : "geometry: sphere; color: blue"');
  });

  it('feeds the full declaration through the normal resolved scene model', () => {
    const declaration = createCursorDeclaration({
      position: [0.2, 0.3, 0.4],
      size: [0.1, 0.2, 0.3],
      properties: { geometry: 'sphere', color: '#38bdf8', metalness: 0.25 },
    });
    const preview = createSpatialDocument(declaration);

    expect(preview.diagnostics).toEqual([]);
    expect(preview.renderNodes).toHaveLength(1);
    expect(preview.renderNodes[0]).toMatchObject({
      geometry: { kind: 'sphere' },
      material: { color: '#38bdf8', metalness: 0.25 },
    });
  });

  it('resolves a named cursor instance against its namespace declaration', () => {
    const declaration = createCursorDeclaration({
      position: [0.2, 0.3, 0.4],
      size: [0.1, 0.2, 0.3],
      namespace: 'PreviewShape',
    });
    const preview = createSpatialDocument(`"PreviewShape/" : "geometry: sphere; color: orange; roughness: 0.2"\n${declaration}`);
    const cursorNode = preview.renderNodes.find((node) => node.source === declaration);

    expect(preview.diagnostics).toEqual([]);
    expect(cursorNode).toMatchObject({
      namespacePath: 'PreviewShape/',
      geometry: { kind: 'sphere' },
      material: { color: 'orange', roughness: 0.2 },
    });
  });

  it('includes inherited namespace descendants in the cursor preview', () => {
    const source = `"Table/" : "color: brown"
"Table/Top/+0+1/+0+1d/+0+1" : ""
"Table/Leg/+0+1d/+0+1/+0+1d" : "geometry: cylinder"`;
    const declaration = createCursorDeclaration({
      position: [1, 0, 0],
      size: [0.8, 0.5, 0.8],
      namespace: 'Table',
    });
    const preview = createCursorPreviewDocument(source, declaration);

    expect(preview.renderNodes.map((node) => node.namespacePath)).toEqual([
      'Table/Top/',
      'Table/Leg/',
    ]);
    expect(preview.renderNodes.every((node) => node.source !== declaration)).toBe(true);
  });

  it('creates six inward-facing clipping planes for the cursor box', () => {
    const planes = cursorClippingPlanes([1, 2, 3], [0, 0, 0], [2, 4, 6]);
    const inside = new Vector3(2, 4, 6);

    expect(planes).toHaveLength(6);
    expect(planes.every((plane) => plane.distanceToPoint(inside) >= 0)).toBe(true);
    expect(planes[0].distanceToPoint(new Vector3(0, 4, 6))).toBeLessThan(0);
    expect(planes[1].distanceToPoint(new Vector3(4, 4, 6))).toBeLessThan(0);
  });
});
