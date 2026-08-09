import { parseXyzDslDocument } from '../xyzdsl/parser';
import { mergeXyzDslContentSpecs, mergeXyzDslGeometrySpecs, mergeXyzDslMaterialSpecs, resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import type { ResolvedConditionalVariant } from '../xyzdsl/resolveDocument';
import type { XyzDslBoxSpec, XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { SpatialDocument } from './SpatialDocument';
import type { SpatialNode } from './SpatialNode';
import { boundsFromTransformedBox, resolveCollisions } from './collision';
import { buildCsgExpressions } from './csg';
import { geometryFromBox } from './geometry';
import {
  anchorTransformFromBox,
  composeTransforms,
  transformFromBox,
} from './transform';
import type { SpatialTransform } from './transform';
import { evaluateInteractions } from './interactions';
import type { InteractionFact } from './interactions';
import { CENTIUNITS_PER_UNIT } from './units';

export interface CreateSpatialDocumentOptions {
  originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>;
  probeTolerance?: number;
}

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
      bounds: state?.bounds ?? node.bounds,
      transform: state?.transform ?? node.transform,
      localTransform: state?.localTransform ?? node.localTransform,
      worldTransform: state?.worldTransform ?? node.worldTransform,
      unionGroupId: state?.unionGroupId ?? node.unionGroupId,
      csgExpressionId: state?.csgExpressionId ?? node.csgExpressionId,
      csgConsumed: state?.csgConsumed ?? node.csgConsumed,
      children: node.children ? applyRenderableStateToTree(node.children, renderableNodes) : undefined,
    };
  });
}

function translateBox(box: XyzDslBoxSpec, magnitude: [number, number, number], fact: InteractionFact): XyzDslBoxSpec {
  const signs = magnitude.map((_, axis) => fact.normal[axis] || fact.inferredDirection[axis] || 1) as [number, number, number];
  return {
    ...box,
    source: `${box.source} (conditional translation)`,
    x: box.x + magnitude[0] * signs[0],
    y: box.y + magnitude[1] * signs[1],
    z: box.z + magnitude[2] * signs[2],
  };
}

export const MIN_TRANSACTION_AMOUNT = 1_000_000;
export const MAX_WEIGHTED_TRANSLATION = 100;

function validWeight(weight: number | undefined): number {
  return Number.isFinite(weight) && weight! > 0 ? weight! : MIN_TRANSACTION_AMOUNT;
}

/** Force-to-weight displacement at centiunit scale, capped at 100 project units (10 metres). */
export function weightedTranslationDistance(cursorWeight: number | undefined, targetWeight: number | undefined): number {
  const projectDistance = validWeight(cursorWeight) / validWeight(targetWeight) / CENTIUNITS_PER_UNIT;
  return Math.min(projectDistance, MAX_WEIGHTED_TRANSLATION);
}

function weightedTranslateBox(box: XyzDslBoxSpec, fact: InteractionFact, targetWeight: number | undefined): XyzDslBoxSpec {
  const direction = fact.normal.some(Boolean) ? fact.normal : fact.inferredDirection;
  const length = Math.hypot(...direction);
  const unitDirection = length > 0 ? direction.map((component) => component / length) : [1, 0, 0];
  const distance = weightedTranslationDistance(fact.cursorWeight, targetWeight);
  return {
    ...box,
    source: `${box.source} (weighted conditional translation)`,
    x: box.x + unitDirection[0] * distance,
    y: box.y + unitDirection[1] * distance,
    z: box.z + unitDirection[2] * distance,
  };
}

function variantsForNode(node: SpatialNode, variants: readonly ResolvedConditionalVariant[], facts: readonly InteractionFact[]) {
  return variants.flatMap((variant) => {
    if (variant.targetNamespacePath !== node.namespacePath) return [];
    const matchingFacts = facts.filter((fact) => variant.conditional.directives.every((directive) =>
      fact.state === directive.name && fact.targetNamespace.startsWith(canonicalNamespacePath(directive.scopeNamespace)),
    ));
    const fact = matchingFacts.sort((a, b) =>
      (b.penetration ?? 0) - (a.penetration ?? 0) ||
      (a.separation ?? 0) - (b.separation ?? 0) ||
      a.streamId.localeCompare(b.streamId) || a.cursorId.localeCompare(b.cursorId),
    )[0];
    return fact ? [{ variant, fact }] : [];
  }).sort((a, b) =>
    a.variant.conditional.directives[0].scopeNamespace.length - b.variant.conditional.directives[0].scopeNamespace.length ||
    a.variant.lineNumber - b.variant.lineNumber,
  );
}

function applyConditionalVariants(
  nodes: SpatialNode[],
  variants: readonly ResolvedConditionalVariant[],
  facts: readonly InteractionFact[],
  parentTransform?: SpatialTransform,
  parentChanged = false,
): SpatialNode[] {
  return nodes.map((node) => {
    let box = { ...node.box };
    let material = node.material;
    let geometry = node.geometry;
    let content = node.content ?? { diagnostics: [] };
    let rotation = node.localTransform?.rotation ?? node.transform.rotation;
    const matches = variantsForNode(node, variants, facts);
    if (matches.length === 0 && !parentChanged) {
      return {
        ...node,
        children: applyConditionalVariants(node.children ?? [], variants, facts, node.worldTransform, false),
      };
    }
    matches.forEach(({ variant, fact }) => {
      const spatial = variant.conditional.spatialOverride;
      if (spatial.mode === 'absolute-box') box = { ...spatial.box };
      if (spatial.mode === 'translation') box = translateBox(box, spatial.magnitude, fact);
      if (spatial.mode === 'weighted-translation') {
        box = weightedTranslateBox(box, fact, node.origin?.transactionAmount);
      }
      material = mergeXyzDslMaterialSpecs(material, variant.properties.material);
      content = mergeXyzDslContentSpecs(content, variant.properties.content);
      if (variant.properties.geometry.declared) {
        geometry = geometryFromBox(box, mergeXyzDslGeometrySpecs({
          kind: geometry.kind,
          diagnostics: [],
          declared: true,
          kindDeclared: true,
          'box-radius': geometry['box-radius'],
          puff: geometry.puff,
          operation: geometry.operation,
        }, variant.properties.geometry));
      }
      if (variant.properties.transform.declared) rotation = variant.properties.transform.rotation;
    });
    geometry = { ...geometry, dimensions: [box.width, box.height, box.depth] };
    const localTransform = matches.length > 0
      ? (node.renderable
          ? transformFromBox(box, { rotation, diagnostics: [] })
          : { ...anchorTransformFromBox(box, { rotation, diagnostics: [] }), scale: node.localTransform?.scale ?? [1, 1, 1] })
      : node.localTransform!;
    const worldTransform = parentTransform ? composeTransforms(parentTransform, localTransform) : localTransform;
    const updated: SpatialNode = {
      ...node,
      baseBox: node.baseBox ?? node.box,
      box,
      material,
      content,
      geometry,
      localTransform,
      worldTransform,
      transform: worldTransform,
      bounds: boundsFromTransformedBox(box, worldTransform),
      activeInteractions: matches.map(({ fact }) => fact),
    };
    updated.children = applyConditionalVariants(node.children ?? [], variants, facts, worldTransform, matches.length > 0 || parentChanged);
    return updated;
  });
}

export function createSpatialDocument(source: string, options: CreateSpatialDocumentOptions = {}): SpatialDocument {
  const parsed = parseXyzDslDocument(source, options.originsByLine);
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
          lineNumber: object.collisionOrder ?? object.lineNumber,
          declarationOnly: object.declarationOnly,
          container: hasChildren,
          reference: object.reference.targetPath,
          materializedFrom: object.materializedFrom,
          anchorScale: object.anchorScale,
        },
        origin: object.origin,
        baseBox: object.box,
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

  const authoredRenderable = flattenRenderable(topLevelNodes);
  const interactions = evaluateInteractions(authoredRenderable, options.probeTolerance);
  const effectiveTree = applyConditionalVariants(topLevelNodes, resolved.variants, interactions);
  const effectiveRenderable = flattenRenderable(effectiveTree);
  const physicalNodes = effectiveRenderable.filter((node) => node.origin?.sourceKind !== 'secondary');
  const sensorNodes = effectiveRenderable.filter((node) => node.origin?.sourceKind === 'secondary');
  const groupedNodes = [...resolveCollisions(physicalNodes), ...sensorNodes];
  const csg = buildCsgExpressions(groupedNodes);
  const renderNodes = csg.nodes.filter((node) => !node.csgConsumed && !node.csgExpressionId);
  const nodes = applyRenderableStateToTree(effectiveTree, csg.nodes);

  return {
    id: 'spatial-document',
    nodes,
    renderNodes,
    csgExpressions: csg.expressions,
    diagnostics,
    interactions,
  };
}
