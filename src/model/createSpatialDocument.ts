import { parseXyzDslDocument } from '../xyzdsl/parser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { SpatialDocument } from './SpatialDocument';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromTransformedBox } from './collision';
import { buildCsgExpressions } from './csg';
import { geometryFromBox } from './geometry';
import {
  anchorTransformFromBox,
  composeTransforms,
  transformFromBox,
} from './transform';

function nearestConcreteAncestor(
  namespace: string[],
  nodesByNamespace: Map<string, SpatialNode>,
): SpatialNode | undefined {
  for (let length = namespace.length - 1; length > 0; length -= 1) {
    const ancestor = nodesByNamespace.get(
      canonicalNamespacePath(namespace.slice(0, length)),
    );

    if (ancestor) {
      return ancestor;
    }
  }

  return undefined;
}

function flattenRenderable(nodes: SpatialNode[]): SpatialNode[] {
  return nodes
    .flatMap((node) => [
      node.renderable ? node : undefined,
      ...flattenRenderable(node.children ?? []),
    ])
    .filter(Boolean) as SpatialNode[];
}

function applyRenderableStateToTree(
  nodes: SpatialNode[],
  renderableNodes: SpatialNode[],
): SpatialNode[] {
  const stateById = new Map(renderableNodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const state = stateById.get(node.id);

    return {
      ...node,
      unionGroupId: state?.unionGroupId ?? node.unionGroupId,
      csgExpressionId: state?.csgExpressionId ?? node.csgExpressionId,
      csgConsumed: state?.csgConsumed ?? node.csgConsumed,
      children: node.children ? applyRenderableStateToTree(node.children, renderableNodes) : undefined,
    };
  });
}

export function createSpatialDocument(source: string): SpatialDocument {
  const parsed = parseXyzDslDocument(source);
  const resolved = resolveXyzDslDocument(parsed.value ?? []);
  const diagnostics = [...parsed.diagnostics, ...resolved.diagnostics];
  const nodesByNamespace = new Map<string, SpatialNode>();
  const topLevelNodes: SpatialNode[] = [];

  resolved.objects
    .sort(
      (a, b) =>
        a.namespace.length - b.namespace.length || a.lineNumber - b.lineNumber,
    )
    .forEach((object) => {
      const parent = nearestConcreteAncestor(
        object.namespace,
        nodesByNamespace,
      );
      const hasChildren = resolved.objects.some(
        (candidate) =>
          candidate !== object &&
          candidate.namespace.length > object.namespace.length &&
          object.namespace.every(
            (segment, index) => candidate.namespace[index] === segment,
          ),
      );
      const localTransform = object.renderable
        ? transformFromBox(object.box, object.transform)
        : {
            ...anchorTransformFromBox(object.box, object.transform),
            scale: object.anchorScale ?? [1, 1, 1],
          };
      const worldTransform = parent?.worldTransform
        ? composeTransforms(parent.worldTransform, localTransform)
        : localTransform;
      const node: SpatialNode = {
        id: object.id,
        source: object.source,
        box: object.box,
        material: object.material,
        content: object.content,
        model: object.model.source ? object.model : undefined,
        geometry: geometryFromBox(object.box, object.geometry),
        localTransform,
        worldTransform,
        transform: worldTransform,
        bounds: boundsFromTransformedBox(object.box, worldTransform),
        namespacePath: object.namespacePath,
        parentNamespacePath: object.parentNamespacePath,
        renderable: object.renderable,
        children: [],
        metadata: {
          lineNumber: object.lineNumber,
          declarationOnly: object.declarationOnly,
          container: hasChildren,
          reference: object.reference.targetPath,
          materializedFrom: object.materializedFrom,
          anchorScale: object.anchorScale,
        },
      };

      if (object.namespacePath && !nodesByNamespace.has(object.namespacePath)) {
        nodesByNamespace.set(object.namespacePath, node);
      }

      if (parent) {
        parent.children = [...(parent.children ?? []), node];
      } else {
        topLevelNodes.push(node);
      }
    });

  const groupedNodes = assignUnionGroups(flattenRenderable(topLevelNodes));
  const csg = buildCsgExpressions(groupedNodes);
  const renderNodes = csg.nodes.filter((node) => !node.csgConsumed && !node.csgExpressionId);
  const nodes = applyRenderableStateToTree(topLevelNodes, csg.nodes);

  return {
    id: 'spatial-document',
    nodes,
    renderNodes,
    csgExpressions: csg.expressions,
    diagnostics,
  };
}
