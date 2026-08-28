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
      ],
    }), base.id);

    expect(selected?.bounds).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 1, minZ: 0, maxZ: 1 });
    expect(selected?.transform.position).toEqual([2.5, 0.5, 0.5]);
    expect(selected?.metadata?.cameraPrecisionScale).toBe(1);
  });

  it('returns ordinary render nodes unchanged', () => {
    const rendered = node('rendered', 2, 3);
    const document: SpatialDocument = { id: 'document', nodes: [], renderNodes: [rendered], csgExpressions: [], diagnostics: [] };
    expect(cameraNodeForSelection(document, rendered.id)).toBe(rendered);
  });

  it('returns a nested composite container so its complete bounds can be highlighted', () => {
    const container = { ...node('container', -2, 6), renderable: false, children: [node('child', 0, 1)] };
    const document: SpatialDocument = { id: 'document', nodes: [container], renderNodes: container.children, csgExpressions: [], diagnostics: [] };

    expect(cameraNodeForSelection(document, container.id)).toBe(container);
  });

  it('uses an intersection tool for CSG focus bounds, center, and precision scale', () => {
    const base = node('base', 0, 10);
    const intersection = node('intersection', 8, 8.01);
    const selected = cameraNodeForSelection(documentWith({
      id: 'csg',
      base,
      operations: [{ op: 'intersection', tool: intersection }],
    }), base.id);

    expect(selected?.bounds.minX).toBeCloseTo(8);
    expect(selected?.bounds.maxX).toBeCloseTo(8.01);
    expect(selected?.transform.position[0]).toBeCloseTo(8.005);
    expect(selected?.metadata?.cameraPrecisionScale).toBeCloseTo(0.01);
  });

  it('uses the surviving CSG geometry after an asymmetric subtraction', () => {
    const base = node('base', 0, 10);
    const selected = cameraNodeForSelection(documentWith({
      id: 'csg',
      base,
      operations: [{ op: 'subtraction', tool: node('cutout', 0.001, 11) }],
    }), base.id);

    expect(selected?.bounds.minX).toBeCloseTo(0);
    expect(selected?.bounds.maxX).toBeCloseTo(0.001);
    expect(selected?.transform.position[0]).toBeCloseTo(0.0005);
    expect(selected?.metadata?.cameraPrecisionScale).toBeCloseTo(0.001);
  });

  it('uses a small internal subtraction tool for composite precision', () => {
    const base = node('base', 0, 10);
    const selected = cameraNodeForSelection(documentWith({
      id: 'csg',
      base,
      operations: [{ op: 'subtraction', tool: node('small-cutout', 4, 4.001) }],
    }), base.id);

    expect(selected?.bounds.minX).toBeCloseTo(0);
    expect(selected?.bounds.maxX).toBeCloseTo(10);
    expect(selected?.metadata?.cameraPrecisionScale).toBeCloseTo(0.001);
  });

  it('ignores a small CSG tool inside geometry removed by an earlier operation', () => {
    const base = node('base', 0, 10);
    const selected = cameraNodeForSelection(documentWith({
      id: 'csg',
      base,
      operations: [
        { op: 'subtraction', tool: node('large-cutout', 4, 6) },
        { op: 'subtraction', tool: node('redundant-detail', 4.5, 4.501) },
      ],
    }), base.id);

    expect(selected?.metadata?.cameraPrecisionScale).toBeCloseTo(1);
  });
});
