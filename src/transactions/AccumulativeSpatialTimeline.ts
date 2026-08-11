import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { RigidBodyDefinition } from '../physics/types';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { SimulationTimeline } from './SimulationTimeline';
import type { PhysicsDirectiveBinding } from './SimulationTimeline';

export interface AccumulativeSpatialFrame {
  document: SpatialDocument;
  tick: number;
}

/** Small deterministic hash used to bind a simulation session to one authored baseline. */
export function spatialBaselineRevision(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `baseline-${(hash >>> 0).toString(16)}`;
}

/** Stable identity for the selected secondary transaction frame, independent of UI state. */
export function accumulativePhysicsFrameKey(
  source: string,
  originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>,
  baselineRevision = spatialBaselineRevision(source),
): string | undefined {
  const lines = source.split('\n');
  const secondaryDeclarations = [...(originsByLine ?? [])]
    .filter(([, origin]) => origin.sourceKind === 'secondary')
    .map(([line, origin]) => [
      origin.streamId ?? origin.publicKey ?? 'secondary',
      origin.transactionId ?? '',
      origin.transactionTime ?? '',
      lines[line - 1]?.trim() ?? '',
    ].join(':'))
    .sort();
  return secondaryDeclarations.length > 0
    ? `${baselineRevision}::${secondaryDeclarations.join('|')}`
    : undefined;
}

function renderable(nodes: readonly SpatialNode[]): SpatialNode[] {
  return nodes.flatMap((node) => [node.renderable ? node : undefined, ...renderable(node.children ?? [])])
    .filter(Boolean) as SpatialNode[];
}

function physicsEntityId(node: SpatialNode): string {
  const component = node.namespacePath?.split('/').filter(Boolean)[0];
  return component ? `component:${component}` : `node:${node.id}`;
}

/** Transaction/playback-owned bridge from XYZDSL contact declarations to persistent physics. */
export class AccumulativeSpatialTimeline {
  readonly simulation = new SimulationTimeline();

  constructor(readonly baselineRevision = 'baseline') {}

  private reconcile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): SpatialDocument {
    const authored = createSpatialDocument(source, { originsByLine, applyConditionalVariants: false });
    const csgEntityByNodeId = new Map<string, string>();
    authored.csgExpressions.forEach((expression) => {
      const entityId = physicsEntityId(expression.base);
      csgEntityByNodeId.set(expression.base.id, entityId);
      expression.operations.forEach(({ tool }) => csgEntityByNodeId.set(tool.id, entityId));
    });
    const definitions: RigidBodyDefinition[] = renderable(authored.nodes)
      .filter((node) => node.origin?.sourceKind !== 'secondary')
      .map((node, entityOrder) => ({
        id: node.id,
        entityId: csgEntityByNodeId.get(node.id) ?? physicsEntityId(node),
        entityOrder,
        contributesToBounds: node.geometry.operation === undefined,
        bounds: node.bounds,
        position: [...(node.worldTransform ?? node.transform).position],
        mass: node.origin?.transactionAmount,
        revision: this.baselineRevision,
      }));
    this.simulation.reconcileDefinitions(definitions);
    return authored;
  }

  /** Recompile against retained state without advancing simulation time. */
  compile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    this.reconcile(source, originsByLine);
    return {
      tick: this.simulation.world.tick,
      document: createSpatialDocument(source, {
        originsByLine,
        physicsFrame: this.simulation.world.frame(),
        accumulativePhysics: true,
      }),
    };
  }

  evaluate(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const authored = this.reconcile(source, originsByLine);

    const current = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: this.simulation.world.frame(),
      accumulativePhysics: true,
    });
    const parsed = parseXyzDslDocument(source, originsByLine);
    const resolved = resolveXyzDslDocument(parsed.value ?? []);
    const idsByNamespace = new Map(renderable(authored.nodes).map((node) => [node.namespacePath, node.id]));
    const bindings = resolved.variants.flatMap((variant): PhysicsDirectiveBinding[] => {
      const targetId = idsByNamespace.get(variant.targetNamespacePath);
      if (!targetId || !variant.conditional.directives.some((directive) => directive.name === 'contact')) return [];
      const interactionDirectives = variant.conditional.directives.map((directive) => ({
        state: directive.name,
        scopeNamespace: canonicalNamespacePath(directive.scopeNamespace),
      }));
      const spatial = variant.conditional.spatialOverride;
      if (spatial.mode === 'translation') return [{ targetId, mode: 'translation', vector: spatial.magnitude, interactionDirectives }];
      if (spatial.mode === 'weighted-translation') {
        const node = renderable(authored.nodes).find(({ id }) => id === targetId);
        return [{ targetId, mode: 'weighted-translation', targetWeight: node?.origin?.transactionAmount, interactionDirectives }];
      }
      return [];
    });
    const tick = this.simulation.world.tick + 1;
    const frame = this.simulation.evaluate(tick, tick, 0, current.interactions ?? [], bindings);
    return {
      tick,
      document: createSpatialDocument(source, {
        originsByLine,
        physicsFrame: frame.physics,
        accumulativePhysics: true,
        interactionFacts: frame.facts,
      }),
    };
  }
}
