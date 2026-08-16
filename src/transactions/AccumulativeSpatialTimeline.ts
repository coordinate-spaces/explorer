import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { compilePhysicsScene } from '../physics/compilePhysicsScene';
import { RapierPhysicsWorld } from '../physics/RapierPhysicsWorld';
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

function withCompilerDiagnostics(document: SpatialDocument, compiled: SpatialDocument): SpatialDocument {
  const diagnostics = [...document.diagnostics];
  compiled.diagnostics.forEach((diagnostic) => {
    if (!diagnostics.some((candidate) => candidate.line === diagnostic.line && candidate.message === diagnostic.message && candidate.source === diagnostic.source)) {
      diagnostics.push(diagnostic);
    }
  });
  return { ...document, diagnostics };
}

function withColliderStateById(nodes: readonly SpatialNode[], conditionalById: ReadonlyMap<string, SpatialNode>): SpatialNode[] {
  return nodes.map((node) => {
    const conditional = conditionalById.get(node.id);
    const copyTransform = (base: SpatialNode['transform'], override: SpatialNode['transform']) => ({
      ...base,
      rotation: override.rotation,
      scale: override.scale,
    });
    return {
      ...node,
      ...(conditional ? {
        box: conditional.box,
        physics: conditional.physics,
        geometry: conditional.geometry,
        transform: copyTransform(node.transform, conditional.transform),
        localTransform: node.localTransform && conditional.localTransform
          ? copyTransform(node.localTransform, conditional.localTransform) : node.localTransform,
        worldTransform: node.worldTransform && conditional.worldTransform
          ? copyTransform(node.worldTransform, conditional.worldTransform) : node.worldTransform,
      } : {}),
      children: withColliderStateById(node.children ?? [], conditionalById),
    };
  });
}

/** Transaction/playback-owned bridge from XYZDSL interaction declarations to persistent physics. */
export class AccumulativeSpatialTimeline {
  readonly simulation: SimulationTimeline;

  constructor(readonly baselineRevision = 'baseline') {
    this.simulation = new SimulationTimeline(new RapierPhysicsWorld());
  }

  dispose(): void { this.simulation.dispose(); }

  private reconcile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): SpatialDocument {
    const retainedFrame = this.simulation.world.frame();
    const authored = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: retainedFrame,
      applyConditionalVariants: false,
    });
    // Translation variants remain simulation inputs, but active declarative
    // collider and physics variants must be present before body reconciliation.
    const conditional = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: retainedFrame,
      accumulativePhysics: true,
      interactionFacts: authored.interactions,
    });
    // Relative/weighted translations are suppressed by accumulativePhysics.
    // Copy collider state without replacing retained positions in the authored tree.
    const conditionalById = new Map(renderable(conditional.nodes).map((node) => [node.id, node]));
    const effective = { ...authored, nodes: withColliderStateById(authored.nodes, conditionalById) };
    const definitions = compilePhysicsScene(effective, this.baselineRevision);
    this.simulation.reconcileDefinitions(definitions);
    return effective;
  }

  /** Recompile against retained state without advancing simulation time. */
  compile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const compiled = this.reconcile(source, originsByLine);
    const document = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: this.simulation.world.frame(),
      accumulativePhysics: true,
    });
    return {
      tick: this.simulation.world.tick,
      document: withCompilerDiagnostics(document, compiled),
    };
  }

  evaluate(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const authored = this.reconcile(source, originsByLine);

    const parsed = parseXyzDslDocument(source, originsByLine);
    const resolved = resolveXyzDslDocument(parsed.value ?? []);
    const idsByNamespace = new Map(renderable(authored.nodes).map((node) => [node.namespacePath, node.id]));
    const bindings = resolved.variants.flatMap((variant): PhysicsDirectiveBinding[] => {
      const targetId = idsByNamespace.get(variant.targetNamespacePath);
      if (!targetId) return [];
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
    // Reuse the retained-pose facts that selected the reconciled conditional
    // state; collider changes must not retroactively change that selection.
    const frame = this.simulation.evaluate(tick, tick, 0, authored.interactions ?? [], bindings);
    return {
      tick,
      document: withCompilerDiagnostics(createSpatialDocument(source, {
        originsByLine,
        physicsFrame: frame.physics,
        accumulativePhysics: true,
        interactionFacts: frame.facts,
      }), authored),
    };
  }
}
