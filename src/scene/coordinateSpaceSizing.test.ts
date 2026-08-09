import { describe, expect, it } from 'vitest';
import type { CsgExpression } from '../model/csg';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { nodesForCoordinateSpaceSizing } from './coordinateSpaceSizing';

function node(id: string): SpatialNode {
  return {
    id,
    source: '',
    box: { source: '', x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1 },
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    material: { diagnostics: [] },
    geometry: { kind: 'box', dimensions: [1, 1, 1] },
    transform: { position: [0.5, 0.5, 0.5], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0] },
  };
}

function documentWithExpression(expression: CsgExpression): SpatialDocument {
  return {
    id: 'spatial-document',
    nodes: [],
    renderNodes: [node('normal')],
    csgExpressions: [expression],
    diagnostics: [],
    coordinateSpace: { width: 40, depth: 40, height: 28 },
  };
}

describe('nodesForCoordinateSpaceSizing', () => {
  it('includes boolean union tools because they can extend the generated mesh bounds', () => {
    const base = node('base');
    const unionTool = node('union-tool');
    const subtractTool = node('subtract-tool');
    const sizingNodes = nodesForCoordinateSpaceSizing(
      documentWithExpression({
        id: 'csg-1',
        base,
        operations: [
          { op: 'union', tool: unionTool },
          { op: 'subtraction', tool: subtractTool },
        ],
      }),
    );

    expect(sizingNodes.map(({ id }) => id)).toEqual(['normal', 'base', 'union-tool']);
  });
});
