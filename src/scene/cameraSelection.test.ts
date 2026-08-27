import { describe, expect, it } from 'vitest';
import type { CsgExpression } from '../model/csg';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { cameraNodeForSelection } from './cameraSelection';

function node(id: string, minX: number, maxX: number): SpatialNode {
  return {
    id,
    source: '',
    box: { source: '', x: minX, y: 0, z: 0, width: maxX - minX, height: 1, depth: 1 },
    bounds: { minX, maxX, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    material: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [maxX - minX, 1, 1] },
    transform: { position: [(minX + maxX) / 2, 0.5, 0.5], rotation: [0, 0, 0], scale: [maxX - minX, 1, 1], pivot: [0, 0, 0] },
  };
}

function documentWith(expression: CsgExpression): SpatialDocument {
  return { id: 'document', nodes: [], renderNodes: [], csgExpressions: [expression], diagnostics: [] };
}

describe('cameraNodeForSelection', () => {
  it('includes union tools in CSG focus bounds and center', () => {
    const base = node('base', 0, 1);
    const selected = cameraNodeForSelection(documentWith({
      id: 'csg',
      base,
      operations: [
        { op: 'union', tool: node('extension', 1, 5) },
        { op: 'subtraction', tool: node('cutout', -4, 6) },
      ],
    }), base.id);

    expect(selected?.bounds).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 1, minZ: 0, maxZ: 1 });
    expect(selected?.transform.position).toEqual([2.5, 0.5, 0.5]);
  });

  it('returns ordinary render nodes unchanged', () => {
    const rendered = node('rendered', 2, 3);
    const document: SpatialDocument = { id: 'document', nodes: [], renderNodes: [rendered], csgExpressions: [], diagnostics: [] };
    expect(cameraNodeForSelection(document, rendered.id)).toBe(rendered);
  });
});
