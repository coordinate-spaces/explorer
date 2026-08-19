import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { InteractionFact } from '../model/interactions';
import { compileArticulatedPhysicsScene } from '../physics/compilePhysicsScene';
import { RapierPhysicsWorld } from '../physics/RapierPhysicsWorld';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { SimulationTimeline } from './SimulationTimeline';
import type { PhysicsDirectiveBinding } from './SimulationTimeline';
import { CoordinateIntentReducer, coordinateIntentInputs, jointCoordinateIntentInput, releasedJointIntentInput } from '../simulation/coordinateIntent';

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

function withActivePhysicsJoints(document: SpatialDocument, compiled: SpatialDocument, world: RapierPhysicsWorld): SpatialDocument {
  const articulations = world.inspectArticulations();
  const snapshot = world.snapshot();
  const entityByNodeId = new Map(snapshot.definitions.map((definition) => [definition.id, definition.entityId ?? definition.id]));
  const assignedArticulationIds = new Set<string>();
  const physicsJoints = renderable(compiled.nodes).flatMap((node) => {
    const kind = node.physics?.joint;
    if (!kind) return [];
    const entityId = entityByNodeId.get(node.id);
    const articulation = articulations.find((candidate) =>
      candidate.childEntityId === entityId && !assignedArticulationIds.has(candidate.id));
    if (articulation) assignedArticulationIds.add(articulation.id);
    const definition = articulation ? snapshot.joints?.find(({ id }) => id === articulation.id) : undefined;
    const parentPublishedWorldAnchor = definition
      ? world.publishedAnchorWorld(definition.parentEntityId, definition.parentAnchor, document.renderNodes) : undefined;
    const childPublishedWorldAnchor = definition
      ? world.publishedAnchorWorld(definition.childEntityId, definition.childAnchor, document.renderNodes) : undefined;
    return [{
      nodeId: node.id,
      nodeName: node.namespacePath?.replace(/\/$/, '').split('/').pop() || node.id,
      kind,
      articulation,
      childAnchor: definition?.childAnchor,
      childAxis: definition && (definition.kind === 'revolute' || definition.kind === 'prismatic')
        ? definition.childAxis : undefined,
      publishedPoseAnchorError: parentPublishedWorldAnchor && childPublishedWorldAnchor
        ? Math.hypot(...parentPublishedWorldAnchor.map((value, index) => value - childPublishedWorldAnchor[index]))
        : undefined,
    }];
  });
  return { ...document, physicsJoints };
}

function withColliderStateById(nodes: readonly SpatialNode[], conditionalById: ReadonlyMap<string, SpatialNode>): SpatialNode[] {
  return nodes.map((node) => {
    const conditional = conditionalById.get(node.id);
    const conditionalPosition = conditional && ['x', 'y', 'z', 'width', 'height', 'depth']
      .some((key) => conditional.box[key as keyof typeof conditional.box] !== node.box[key as keyof typeof node.box]);
    const copyTransform = (base: SpatialNode['transform'], override: SpatialNode['transform']) => ({
      ...base,
      ...(conditionalPosition ? { position: override.position } : {}),
      rotation: override.rotation,
      scale: override.scale,
    });
    return {
      ...node,
      ...(conditional ? {
        box: conditional.box,
        ...(conditionalPosition ? { bounds: conditional.bounds } : {}),
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
  private readonly intents = new CoordinateIntentReducer();
  private activeJointIntents = new Map<string, { jointId: string; release: 'hold' | 'brake' | 'passive' }>();

  constructor(readonly baselineRevision = 'baseline') {
    this.simulation = new SimulationTimeline(new RapierPhysicsWorld());
  }

  dispose(): void { this.simulation.dispose(); }

  private interactionFacts(document: SpatialDocument): InteractionFact[] {
    return this.simulation.world.queryInteractions({ periodicSpace: document.coordinateSpace }).map((result) => ({
      state: result.state,
      targetId: result.target.id,
      targetNamespace: result.target.namespace,
      cursorId: result.cursor.id,
      cursorNamespace: result.cursor.namespace,
      streamId: result.cursor.streamId,
      transactionId: result.cursor.transactionId,
      transactionTime: result.cursor.transactionTime,
      cursorWeight: result.cursor.weight,
      normal: result.normal,
      inferredDirection: result.inferredDirection,
      penetration: result.penetration,
      resolutionDistance: result.resolutionDistance,
      separation: result.separation,
    }));
  }

  private reconcile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): {
    authored: SpatialDocument;
    effective: SpatialDocument;
    facts: InteractionFact[];
  } {
    const retainedSnapshot = this.simulation.world.snapshot();
    const authored = createSpatialDocument(source, {
      originsByLine,
      applyConditionalVariants: false,
      interactionFacts: [],
    });
    // Reconcile and query the authored pre-variant scene. A variant selected by
    // these facts can alter only the scene used by the next transaction tick.
    const authoredScene = compileArticulatedPhysicsScene(authored, this.baselineRevision);
    this.simulation.reconcileDefinitions(authoredScene.bodies, authoredScene.joints);
    const facts = this.interactionFacts(authored);
    const conditional = createSpatialDocument(source, {
      originsByLine,
      accumulativePhysics: true,
      interactionFacts: facts,
    });
    // Relative/weighted translations are suppressed by accumulativePhysics.
    // Copy collider state without replacing retained positions in the authored tree.
    const conditionalById = new Map(renderable(conditional.nodes).map((node) => [node.id, node]));
    const effective = { ...authored, nodes: withColliderStateById(authored.nodes, conditionalById) };
    // The authored reconciliation exists only to run the pre-variant query. Do
    // not let its temporary poses become the "previous" state preserved while
    // installing effective conditional definitions.
    this.simulation.world.restore(retainedSnapshot);
    const definitions = compileArticulatedPhysicsScene(effective, this.baselineRevision);
    this.simulation.reconcileDefinitions(definitions.bodies, definitions.joints);
    return { authored, effective, facts };
  }

  /** Recompile against retained state without advancing simulation time. */
  compile(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const { effective, facts } = this.reconcile(source, originsByLine);
    const document = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: this.simulation.world.frame(),
      accumulativePhysics: true,
      interactionFacts: facts,
    });
    return {
      tick: this.simulation.world.tick,
      document: withActivePhysicsJoints(withCompilerDiagnostics(document, effective), effective, this.simulation.world as RapierPhysicsWorld),
    };
  }

  evaluate(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const { authored, effective, facts } = this.reconcile(source, originsByLine);

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
    const states = this.simulation.world.frame().states;
    const physicsDefinitions = this.simulation.world.snapshot().definitions;
    const currentJointTargets = new Map(resolved.intents.flatMap((intent) => intent.target?.kind === 'joint' ? [[intent.id, intent.target.id] as const] : []));
    const releasedInputs = [...this.activeJointIntents].flatMap(([intentId, previous]) => {
      if (currentJointTargets.get(intentId) === previous.jointId) return [];
      this.activeJointIntents.delete(intentId);
      const input = releasedJointIntentInput(previous.jointId, tick, previous.release);
      return input ? [input] : [];
    });
    const controllerInputs = resolved.intents.flatMap((intent) => {
      const frameId = intent.origin.transactionId ?? `${intent.origin.transactionTime ?? tick}:${intent.origin.sourceOrder ?? intent.lineNumber}`;
      const pointer = this.intents.apply({ id: intent.id, mode: intent.mode, coordinate: intent.coordinate, frameId }).pointer;
      if (intent.target?.kind === 'joint') {
        this.activeJointIntents.set(intent.id, { jointId: intent.target.id, release: intent.target.release ?? 'hold' });
        return [jointCoordinateIntentInput(intent.target.id, pointer[0], intent.target.command ?? 'position', tick, intent.origin.sourceOrder ?? intent.lineNumber)];
      }
      const node = renderable(authored.nodes).find((candidate) => candidate.metadata?.intentId === intent.id);
      const requestedBodyId = intent.target?.kind === 'body' && intent.target.id ? intent.target.id : node?.id;
      const bodyId = requestedBodyId && (states.has(requestedBodyId) ? requestedBodyId
        : physicsDefinitions.find((definition) => (definition.entityId ?? definition.id) === requestedBodyId)?.id);
      const state = bodyId ? states.get(bodyId) : undefined;
      if (!bodyId || !state) return [];
      const grounded = Math.abs(state.linearVelocity[1]) < 1e-3;
      return coordinateIntentInputs(bodyId, state, pointer, intent.definition.physics, tick, grounded).inputs;
    });
    // Reuse the retained-pose facts that selected the reconciled conditional
    // state; collider changes must not retroactively change that selection.
    const frame = this.simulation.evaluate(tick, tick, 0, facts, bindings, [...releasedInputs, ...controllerInputs]);
    return {
      tick,
      document: withActivePhysicsJoints(withCompilerDiagnostics(createSpatialDocument(source, {
        originsByLine,
        physicsFrame: frame.physics,
        accumulativePhysics: true,
        interactionFacts: frame.facts,
      }), effective), effective, this.simulation.world as RapierPhysicsWorld),
    };
  }
}
