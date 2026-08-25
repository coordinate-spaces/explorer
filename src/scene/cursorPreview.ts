import { Euler, Plane, Quaternion, Vector3 } from 'three';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { createSpatialDocument } from '../model/createSpatialDocument';

function visitNodes(nodes: readonly SpatialNode[], visit: (node: SpatialNode) => void): void {
  nodes.forEach((node) => {
    visit(node);
    visitNodes(node.children ?? [], visit);
  });
}

export function createCursorPreviewDocument(source: string, declaration: string): SpatialDocument {
  const trimmedSource = source.trimEnd();
  const previewLineNumber = trimmedSource ? trimmedSource.split('\n').length + 1 : 1;
  const resolved = createSpatialDocument([trimmedSource, declaration].filter(Boolean).join('\n'));
  const previewIds = new Set<string>();

  visitNodes(resolved.nodes, (node) => {
    if (node.metadata?.lineNumber === previewLineNumber) {
      visitNodes([node], (descendant) => previewIds.add(descendant.id));
    }
  });

  return {
    ...resolved,
    renderNodes: resolved.renderNodes.filter((node) => previewIds.has(node.id)),
    csgExpressions: resolved.csgExpressions.filter((expression) => previewIds.has(expression.base.id)),
  };
}

export function cursorClippingPlanes(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
  size: readonly [number, number, number],
): Plane[] {
  const origin = new Vector3(...position);
  const quaternion = new Quaternion().setFromEuler(new Euler(...rotation, 'XYZ'));
  const localPlanes: Array<[Vector3, Vector3]> = [
    [new Vector3(1, 0, 0), new Vector3(0, 0, 0)],
    [new Vector3(-1, 0, 0), new Vector3(size[0], 0, 0)],
    [new Vector3(0, 1, 0), new Vector3(0, 0, 0)],
    [new Vector3(0, -1, 0), new Vector3(0, size[1], 0)],
    [new Vector3(0, 0, 1), new Vector3(0, 0, 0)],
    [new Vector3(0, 0, -1), new Vector3(0, 0, size[2])],
  ];

  return localPlanes.map(([normal, point]) => new Plane().setFromNormalAndCoplanarPoint(
    normal.applyQuaternion(quaternion),
    point.applyQuaternion(quaternion).add(origin),
  ));
}
