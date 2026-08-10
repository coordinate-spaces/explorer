import type { InteractionFact } from '../model/interactions';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition, Vector3Tuple } from '../physics/types';
import { interactionTransitions } from './interactionTimeline';
import type { InteractionTransition } from './interactionTimeline';

export interface PhysicsDirectiveBinding {
  targetId: string;
  mode: 'force' | 'impulse' | 'translation' | 'weighted-translation';
  magnitude?: number;
  vector?: Vector3Tuple;
  targetWeight?: number;
  /** Predicates that select the interaction fact independently of the response body. */
  interactionDirectives?: Array<{
    state: 'probe' | 'breach' | 'contact';
    scopeNamespace: string;
  }>;
}

export interface SimulationFrame {
  transactionTime: number;
  stableSourceOrder: number;
  facts: InteractionFact[];
  transitions: InteractionTransition[];
  physics: PhysicsFrame;
}

function direction(fact: InteractionFact): Vector3Tuple {
  const candidate = fact.normal.some(Boolean) ? fact.normal : fact.inferredDirection;
  const length = Math.hypot(...candidate);
  return length ? candidate.map((component) => component / length) as Vector3Tuple : [1, 0, 0];
}

function bindingMatchesFact(binding: PhysicsDirectiveBinding, fact: InteractionFact): boolean {
  if (!binding.interactionDirectives?.length) return fact.targetId === binding.targetId;
  return binding.interactionDirectives.every((directive) =>
    (directive.state === 'contact' || directive.state === fact.state) &&
    fact.targetNamespace.startsWith(directive.scopeNamespace));
}

function selectInteractionFact(
  binding: PhysicsDirectiveBinding,
  facts: readonly InteractionFact[],
): InteractionFact | undefined {
  return facts.filter((fact) => bindingMatchesFact(binding, fact)).sort((a, b) =>
    (b.penetration ?? 0) - (a.penetration ?? 0) ||
    (a.separation ?? 0) - (b.separation ?? 0) ||
    a.streamId.localeCompare(b.streamId) || a.cursorId.localeCompare(b.cursorId))[0];
}

/** Owns consecutive interaction facts and physics state outside React rendering. */
export class SimulationTimeline {
  private previousFacts: InteractionFact[] = [];
  private previousBindings: PhysicsDirectiveBinding[] = [];
  private snapshots = new Map<number, {
    physics: PhysicsSnapshot;
    facts: InteractionFact[];
    bindings: PhysicsDirectiveBinding[];
  }>();

  constructor(readonly world = new PhysicsWorld()) {
    this.snapshots.set(0, { physics: world.snapshot(), facts: [], bindings: [] });
  }

  private invalidateSnapshotsAfter(tick: number): void {
    [...this.snapshots.keys()]
      .filter((snapshotTick) => snapshotTick > tick)
      .forEach((snapshotTick) => this.snapshots.delete(snapshotTick));
  }

  reconcileDefinitions(definitions: readonly RigidBodyDefinition[]): void {
    this.world.reconcileDefinitions(definitions);
    this.invalidateSnapshotsAfter(this.world.tick);
    this.snapshots.set(this.world.tick, {
      physics: this.world.snapshot(),
      facts: [...this.previousFacts],
      bindings: [...this.previousBindings],
    });
  }

  evaluate(
    tick: number,
    transactionTime: number,
    stableSourceOrder: number,
    facts: readonly InteractionFact[],
    bindings: readonly PhysicsDirectiveBinding[],
  ): SimulationFrame {
    if (tick <= this.world.tick) throw new Error('Simulation frames must advance; use seek before replaying a prior tick.');
    this.invalidateSnapshotsAfter(this.world.tick);
    const transitions = interactionTransitions(this.previousFacts, facts);
    const inputs: PhysicsInput[] = [];
    const addForces = (
      inputTick: number,
      activeFacts: readonly InteractionFact[],
      activeBindings: readonly PhysicsDirectiveBinding[],
    ) => {
      activeBindings.filter(({ mode }) => mode === 'force').forEach((binding) => {
        const fact = selectInteractionFact(binding, activeFacts);
        if (!fact) return;
        inputs.push({ kind: 'force', bodyId: binding.targetId, tick: inputTick, stableSourceOrder, vector: direction(fact).map((value) => value * (binding.magnitude ?? 0)) as Vector3Tuple });
      });
    };
    for (let inputTick = this.world.tick + 1; inputTick < tick; inputTick += 1) {
      addForces(inputTick, this.previousFacts, this.previousBindings);
    }
    addForces(tick, facts, bindings);
    bindings.filter(({ mode }) => mode === 'translation' || mode === 'weighted-translation').forEach((binding) => {
      const fact = selectInteractionFact(binding, facts);
      if (!fact) return;
      let vector: Vector3Tuple;
      if (binding.mode === 'translation') {
        const signs = (binding.vector ?? [0, 0, 0]).map((_, axis) => fact.normal[axis] || fact.inferredDirection[axis] || 1);
        vector = (binding.vector ?? [0, 0, 0]).map((value, axis) => value * signs[axis]) as Vector3Tuple;
      } else {
        const unit = direction(fact);
        const cursorWeight = Number.isFinite(fact.cursorWeight) && fact.cursorWeight! > 0 ? fact.cursorWeight! : 1_000_000;
        const targetWeight = Number.isFinite(binding.targetWeight) && binding.targetWeight! > 0 ? binding.targetWeight! : 1_000_000;
        const distance = Math.min(cursorWeight / targetWeight / 100, 100) + (fact.state === 'breach' ? fact.resolutionDistance ?? 0 : 0);
        vector = unit.map((value) => value * distance) as Vector3Tuple;
      }
      inputs.push({ kind: 'translation', bodyId: binding.targetId, tick, stableSourceOrder, vector });
    });
    transitions.filter(({ kind }) => kind === 'enter').forEach(({ fact }) => {
      bindings.filter((binding) => binding.mode === 'impulse' && bindingMatchesFact(binding, fact)).forEach((binding) => {
        inputs.push({ kind: 'impulse', bodyId: binding.targetId, tick, stableSourceOrder, vector: direction(fact).map((value) => value * (binding.magnitude ?? 0)) as Vector3Tuple });
      });
    });
    this.world.enqueueInputs(inputs);
    const physics = this.world.step(tick);
    this.previousFacts = [...facts];
    this.previousBindings = [...bindings];
    this.snapshots.set(tick, {
      physics: this.world.snapshot(),
      facts: [...facts],
      bindings: [...bindings],
    });
    return { transactionTime, stableSourceOrder, facts: [...facts], transitions, physics };
  }

  /** Restores an exact cached tick. Callers replay transaction frames when no exact snapshot exists. */
  seek(tick: number): boolean {
    const snapshot = this.snapshots.get(tick);
    if (!snapshot) return false;
    this.world.restore(snapshot.physics);
    this.previousFacts = [...snapshot.facts];
    this.previousBindings = [...snapshot.bindings];
    return true;
  }
}
