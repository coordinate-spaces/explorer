import type { InteractionFact } from '../model/interactions';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition, Vector3Tuple } from '../physics/types';
import { interactionTransitions } from './interactionTimeline';
import type { InteractionTransition } from './interactionTimeline';

export interface PhysicsDirectiveBinding {
  targetId: string;
  mode: 'force' | 'impulse';
  magnitude: number;
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

/** Owns consecutive interaction facts and physics state outside React rendering. */
export class SimulationTimeline {
  private previousFacts: InteractionFact[] = [];
  private snapshots = new Map<number, { physics: PhysicsSnapshot; facts: InteractionFact[] }>();

  constructor(readonly world = new PhysicsWorld()) {
    this.snapshots.set(0, { physics: world.snapshot(), facts: [] });
  }

  reconcileDefinitions(definitions: readonly RigidBodyDefinition[]): void {
    this.world.reconcileDefinitions(definitions);
    if (this.world.tick === 0) this.snapshots.set(0, { physics: this.world.snapshot(), facts: [...this.previousFacts] });
  }

  evaluate(
    tick: number,
    transactionTime: number,
    stableSourceOrder: number,
    facts: readonly InteractionFact[],
    bindings: readonly PhysicsDirectiveBinding[],
  ): SimulationFrame {
    if (tick <= this.world.tick) throw new Error('Simulation frames must advance; use seek before replaying a prior tick.');
    const transitions = interactionTransitions(this.previousFacts, facts);
    const bindingsByTarget = new Map(bindings.map((binding) => [binding.targetId, binding]));
    const inputs: PhysicsInput[] = [];
    for (let inputTick = this.world.tick + 1; inputTick <= tick; inputTick += 1) {
      facts.forEach((fact) => {
        const binding = bindingsByTarget.get(fact.targetId);
        if (binding?.mode !== 'force') return;
        inputs.push({ kind: 'force', bodyId: fact.targetId, tick: inputTick, stableSourceOrder, vector: direction(fact).map((value) => value * binding.magnitude) as Vector3Tuple });
      });
    }
    transitions.filter(({ kind }) => kind === 'enter').forEach(({ fact }) => {
      const binding = bindingsByTarget.get(fact.targetId);
      if (binding?.mode !== 'impulse') return;
      inputs.push({ kind: 'impulse', bodyId: fact.targetId, tick: this.world.tick + 1, stableSourceOrder, vector: direction(fact).map((value) => value * binding.magnitude) as Vector3Tuple });
    });
    this.world.enqueueInputs(inputs);
    const physics = this.world.step(tick);
    this.previousFacts = [...facts];
    this.snapshots.set(tick, { physics: this.world.snapshot(), facts: [...facts] });
    return { transactionTime, stableSourceOrder, facts: [...facts], transitions, physics };
  }

  /** Restores an exact cached tick. Callers replay transaction frames when no exact snapshot exists. */
  seek(tick: number): boolean {
    const snapshot = this.snapshots.get(tick);
    if (!snapshot) return false;
    this.world.restore(snapshot.physics);
    this.previousFacts = [...snapshot.facts];
    return true;
  }
}

