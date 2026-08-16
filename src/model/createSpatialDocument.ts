import { parseXyzDslDocument } from '../xyzdsl/parser';
import { mergeXyzDslContentSpecs, mergeXyzDslGeometrySpecs, mergeXyzDslMaterialSpecs, mergeXyzDslPhysicsSpecs, resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import type { ResolvedConditionalVariant } from '../xyzdsl/resolveDocument';
import type { XyzDslBoxSpec, XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { SpatialDocument } from './SpatialDocument';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromTransformedBox } from './collision';
import { buildCsgExpressions } from './csg';
import { geometryFromBox } from './geometry';
import {
  anchorTransformFromBox,
  composeTransforms,
  relativeTransform,
  transformFromBox,
} from './transform';
import type { SpatialTransform } from './transform';
import { evaluateInteractions } from './interactions';
import type { InteractionFact } from './interactions';
import { CENTIUNITS_PER_UNIT } from './units';
import { dimensionsFromNodes, translateBoxWithinCoordinateSpace, wrapCoordinate } from './coordinateSpace';
import type { CoordinateSpaceDimensions } from './coordinateSpace';
import type { PhysicsFrame } from '../physics/types';
import { Euler, Quaternion } from 'three';

export interface CreateSpatialDocumentOptions {
  originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>;
  probeTolerance?: number;
  /** Completed immutable physics state; document compilation never advances it. */
  physicsFrame?: PhysicsFrame;
  /** Physics owns conditional translation; conditional material/geometry still apply. */
  accumulativePhysics?: boolean;
  /** Build authored body definitions without applying any interaction variants. */
  applyConditionalVariants?: boolean;
  /** Completed facts that triggered this frame, supplied when physics has already stepped. */
  interactionFacts?: readonly InteractionFact[];
}

function applyPhysicsFrame(nodes: SpatialNode[], frame: PhysicsFrame | undefined): SpatialNode[] {
  if (!frame) return nodes;
  return nodes.map((node) => {
    const state = frame.states.get(node.id);
    if (!state) return node;
    const current = (node.worldTransform ?? node.transform).position;
    const delta = state.position.map((value, axis) => value - current[axis]) as [number, number, number];
    const euler = new Euler().setFromQuaternion(new Quaternion(...state.orientation), 'XYZ');
    const rotation: [number, number, number] = [euler.x, euler.y, euler.z];
    const translateTransform = (transform: SpatialTransform | undefined) => transform && ({
      ...transform,
      position: transform.position.map((value, axis) => value + delta[axis]) as [number, number, number],
      rotation,
    });
    const transform = translateTransform(node.transform)!;
    const worldTransform = translateTransform(node.worldTransform);
    return {
      ...node,
      bounds: boundsFromTransformedBox(node.baseBox ?? node.box, worldTransform ?? transform),
      transform,
      worldTransform,
    };
  });
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

function translateNodeWorldState(
  node: SpatialNode,
  deltaX: number,
  deltaZ: number,
  parentWorldTransform?: SpatialTransform,
): SpatialNode {
  const translateTransform = (transform: SpatialTransform | undefined): SpatialTransform | undefined => transform && ({
    ...transform,
    position: [transform.position[0] + deltaX, transform.position[1], transform.position[2] + deltaZ],
  });
  const worldTransform = translateTransform(node.worldTransform ?? node.transform)!;
  const localTransform = parentWorldTransform
    ? relativeTransform(parentWorldTransform, worldTransform)
    : worldTransform;

  return {
    ...node,
    unwrappedTransform: node.unwrappedTransform ?? node.worldTransform ?? node.transform,
    bounds: {
      ...node.bounds,
      minX: node.bounds.minX + deltaX,
      maxX: node.bounds.maxX + deltaX,
      minZ: node.bounds.minZ + deltaZ,
      maxZ: node.bounds.maxZ + deltaZ,
    },
    localTransform,
    transform: worldTransform,
    worldTransform,
    children: node.children?.map((child) => translateNodeWorldState(child, deltaX, deltaZ, worldTransform)),
  };
}

/** Keep secondary cursor roots and their descendants in the same periodic cell as the rendered space. */
function wrapSecondaryCursors(
  nodes: SpatialNode[],
  space: CoordinateSpaceDimensions,
  parentWorldTransform?: SpatialTransform,
): SpatialNode[] {
  return nodes.map((node) => {
    if (node.origin?.sourceKind !== 'secondary') {
      return {
        ...node,
        children: wrapSecondaryCursors(node.children ?? [], space, node.worldTransform),
      };
    }

    const worldPosition = (node.worldTransform ?? node.transform).position;
    const wrappedX = wrapCoordinate(worldPosition[0], space.width);
    const wrappedZ = wrapCoordinate(worldPosition[2], space.depth);

    return translateNodeWorldState(
      node,
      wrappedX - worldPosition[0],
      wrappedZ - worldPosition[2],
      parentWorldTransform,
    );
  });
}

function translateBox(box: XyzDslBoxSpec, magnitude: [number, number, number], fact: InteractionFact, space: CoordinateSpaceDimensions): XyzDslBoxSpec {
  const signs = magnitude.map((_, axis) => fact.normal[axis] || fact.inferredDirection[axis] || 1) as [number, number, number];
  return translateBoxWithinCoordinateSpace({
    ...box,
    source: `${box.source} (conditional translation)`,
  }, magnitude.map((value, axis) => value * signs[axis]) as [number, number, number], space);
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

function weightedTranslateBox(
  box: XyzDslBoxSpec,
  fact: InteractionFact,
  targetWeight: number | undefined,
  space: CoordinateSpaceDimensions,
): XyzDslBoxSpec {
  const direction = fact.normal.some(Boolean) ? fact.normal : fact.inferredDirection;
  const length = Math.hypot(...direction);
  const unitDirection = length > 0 ? direction.map((component) => component / length) : [1, 0, 0];
  const distance = weightedTranslationDistance(fact.cursorWeight, targetWeight);
  return translateBoxWithinCoordinateSpace({
    ...box,
    source: `${box.source} (weighted conditional translation)`,
  }, unitDirection.map((value) => value * distance) as [number, number, number], space);
}

function variantsForNode(node: SpatialNode, variants: readonly ResolvedConditionalVariant[], facts: readonly InteractionFact[]) {
  return variants.flatMap((variant) => {
    if (variant.targetNamespacePath !== node.namespacePath) return [];
    const matchingFacts = facts.filter((fact) => variant.conditional.directives.every((directive) =>
      fact.state === directive.name &&
      fact.targetNamespace.startsWith(canonicalNamespacePath(directive.scopeNamespace)),
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
  space: CoordinateSpaceDimensions,
  parentTransform?: SpatialTransform,
  parentChanged = false,
  accumulativePhysics = false,
): SpatialNode[] {
  return nodes.map((node) => {
    let box = { ...node.box };
    let material = node.material;
    let physics = node.physics ?? { diagnostics: [] };
    let geometry = node.geometry;
    let content = node.content ?? { diagnostics: [] };
    let rotation = node.localTransform?.rotation ?? node.transform.rotation;
    let transformChanged = false;
    let positionChanged = false;
    const matches = variantsForNode(node, variants, facts);
    if (matches.length === 0 && !parentChanged) {
      return {
        ...node,
        children: applyConditionalVariants(node.children ?? [], variants, facts, space, node.worldTransform, false, accumulativePhysics),
      };
    }
    matches.forEach(({ variant, fact }) => {
      const spatial = variant.conditional.spatialOverride;
      const physicsOwnsTranslation = accumulativePhysics &&
        (spatial.mode === 'translation' || spatial.mode === 'weighted-translation');
      if (spatial.mode === 'absolute-box') {
        box = { ...spatial.box };
        transformChanged = true;
        positionChanged = true;
      }
      if (!physicsOwnsTranslation && spatial.mode === 'translation') {
        box = translateBox(box, spatial.magnitude, fact, space);
        transformChanged = true;
        positionChanged = true;
      }
      if (!physicsOwnsTranslation && spatial.mode === 'weighted-translation') {
        box = weightedTranslateBox(
          box,
          fact,
          node.origin?.transactionAmount,
          space,
        );
        transformChanged = true;
        positionChanged = true;
      }
      material = mergeXyzDslMaterialSpecs(material, variant.properties.material);
      physics = mergeXyzDslPhysicsSpecs(physics, variant.properties.physics);
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
      if (variant.properties.transform.declared) {
        rotation = variant.properties.transform.rotation;
        transformChanged = true;
      }
    });
    geometry = { ...geometry, dimensions: [box.width, box.height, box.depth] };
    const localTransform = positionChanged
      ? (node.renderable
          ? transformFromBox(box, { rotation, diagnostics: [] })
          : { ...anchorTransformFromBox(box, { rotation, diagnostics: [] }), scale: node.localTransform?.scale ?? [1, 1, 1] })
      : transformChanged
        ? { ...node.localTransform!, rotation }
        : node.localTransform!;
    const composedWorldTransform = transformChanged || parentChanged
      ? (parentTransform ? composeTransforms(parentTransform, localTransform) : localTransform)
      : (node.worldTransform ?? node.transform);
    const worldTransform = transformChanged && !positionChanged && !parentChanged
      ? { ...composedWorldTransform, position: [...(node.worldTransform ?? node.transform).position] as [number, number, number] }
      : composedWorldTransform;
    const updated: SpatialNode = {
      ...node,
      baseBox: node.baseBox ?? node.box,
      box,
      material,
      physics,
      content,
      geometry,
      localTransform,
      worldTransform,
      transform: worldTransform,
      bounds: boundsFromTransformedBox(box, worldTransform),
      activeInteractions: matches.map(({ fact }) => fact),
    };
    updated.children = applyConditionalVariants(node.children ?? [], variants, facts, space, worldTransform, transformChanged || parentChanged, accumulativePhysics);
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
        physics: object.physics,
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
  const authoredPhysicalNodes = authoredRenderable.filter((node) => node.origin?.sourceKind !== 'secondary');
  const coordinateSpace = dimensionsFromNodes(authoredPhysicalNodes);
  const wrappedTree = wrapSecondaryCursors(topLevelNodes, coordinateSpace);
  const positionedRenderable = applyPhysicsFrame(flattenRenderable(wrappedTree), options.physicsFrame);
  const positionedTree = applyRenderableStateToTree(wrappedTree, positionedRenderable);
  const interactions = options.interactionFacts
    ? [...options.interactionFacts]
    : evaluateInteractions(positionedRenderable, options.probeTolerance, coordinateSpace);
  const effectiveTree = options.applyConditionalVariants === false
    ? positionedTree
    : applyConditionalVariants(positionedTree, resolved.variants, interactions, coordinateSpace, undefined, false, options.accumulativePhysics);
  const effectiveRenderable = flattenRenderable(effectiveTree);
  const physicsModeByEntity = new Map<string, string>();
  effectiveRenderable.forEach((node) => {
    if (node.geometry.operation === 'subtraction' || node.geometry.operation === 'intersection') {
      diagnostics.push({
        line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
        message: `Physics collider omitted: ${node.geometry.operation} CSG tools cannot be represented faithfully by positive primitive colliders.`,
      });
    }
    if (node.origin?.sourceKind === 'secondary' && node.physics['physical-body'] !== true) return;
    const component = node.namespacePath?.split('/').filter(Boolean)[0];
    const identityPrefix = node.origin?.sourceKind === 'secondary'
      ? `secondary:${node.origin.streamId ?? node.origin.publicKey ?? 'unknown'}:` : '';
    const entity = `${identityPrefix}${component ? `component:${component}` : `node:${node.id}`}`;
    const mode = node.physics['physics-mode'] ?? 'dynamic';
    const established = physicsModeByEntity.get(entity);
    if (!established) physicsModeByEntity.set(entity, mode);
    else if (established !== mode) diagnostics.push({
      line: Number(node.metadata?.lineNumber ?? 0), source: node.source,
      message: `Conflicting physics-mode "${mode}" in compound "${entity}"; using first mode "${established}".`,
    });
  });
  const physicalNodes = effectiveRenderable.filter((node) => node.origin?.sourceKind !== 'secondary');
  const sensorNodes = effectiveRenderable.filter((node) => node.origin?.sourceKind === 'secondary');
  // Authored documents preserve their baseline coordinates. World packing is a
  // simulation concern and is represented by the supplied physics frame.
  const groupedNodes = [...assignUnionGroups(physicalNodes), ...sensorNodes];
  const csg = buildCsgExpressions(groupedNodes);
  const renderNodes = csg.nodes.filter((node) => !node.csgConsumed && !node.csgExpressionId);
  const nodes = applyRenderableStateToTree(effectiveTree, csg.nodes);

  return {
    id: 'spatial-document',
    nodes,
    renderNodes,
    csgExpressions: csg.expressions,
    diagnostics,
    coordinateSpace,
    interactions,
    physicsTick: options.physicsFrame?.tick,
  };
}
