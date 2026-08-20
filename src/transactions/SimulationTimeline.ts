import type { InteractionFact } from '../model/interactions';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyWorld } from '../physics/RigidBodyWorld';
import type { JointDefinition, PhysicsFrame, PhysicsInput, PhysicsSnapshot, RigidBodyDefinition, Vector3Tuple } from '../physics/types';
import { interactionTransitions } from './interactionTimeline';
import type { InteractionTransition } from './interactionTimeline';
import { RELEASE_C_ACTIVE_CAPABILITIES, validateJointDefinitions, validatePhysicsInputs, type ArticulationCapabilities } from '../physics/articulationCapabilities';

export interface PhysicsDirectiveBinding {
  targetId: string;
  mode: 'force' | 'impulse' | 'translation' | 'weighted-translation' | 'joint-position-target' | 'joint-velocity-target' | 'joint-effort';
  jointId?: string;
  value?: number;
  /** enter is one-shot, stay is maintained, leave disables or returns to rest. */
  phase?: 'enter' | 'stay' | 'leave';
  leave?: 'passive' | 'hold' | 'rest';
  restValue?: number;
  magnitude?: number;
  vector?: Vector3Tuple;
  targetWeight?: number;
  /** Predicates that select the interaction fact independently of the response body. */
  interactionDirectives?: Array<{
    state: 'touch' | 'breach';
    scopeNamespace: string;
  }>;
}

/** Resolves controller ownership to exactly one command per joint degree of freedom. */
export function resolveJointControllerInputs(inputs: readonly PhysicsInput[]): PhysicsInput[] {
  const ordinary = inputs.filter((input) => !input.kind.startsWith('joint-'));
  const groups = new Map<string, Extract<PhysicsInput, { jointId: string }>[]>();
  inputs.forEach((input) => {
    if (!input.kind.startsWith('joint-')) return;
    const command = input as Extract<PhysicsInput, { jointId: string }>;
    groups.set(command.jointId, [...(groups.get(command.jointId) ?? []), command]);
  });
  const resolved = [...groups.values()].map((commands) => {
    const sorted = [...commands].sort((a, b) => (b.controllerPriority ?? 0) - (a.controllerPriority ?? 0) || (a.stableSourceOrder ?? 0) - (b.stableSourceOrder ?? 0));
    const highestPriority = sorted[0].controllerPriority ?? 0;
    const exclusive = sorted.find((command) => (command.controllerPriority ?? 0) === highestPriority && command.exclusive);
    if (exclusive) return exclusive;
    const priority = highestPriority;
    const peers = sorted.filter((command) => (command.controllerPriority ?? 0) === priority && command.kind === sorted[0].kind);
    const weight = peers.reduce((sum, command) => sum + Math.max(0, command.blendWeight ?? 1), 0);
    return weight > 0 ? { ...peers[0], value: peers.reduce((sum, command) => sum + command.value * Math.max(0, command.blendWeight ?? 1), 0) / weight } : peers[0];
  });
  return [...ordinary, ...resolved];
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
    directive.state === fact.state &&
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

  constructor(readonly world: RigidBodyWorld = new PhysicsWorld(), readonly capabilities: ArticulationCapabilities = RELEASE_C_ACTIVE_CAPABILITIES) {
    this.snapshots.set(0, { physics: world.snapshot(), facts: [], bindings: [] });
  }

  /** Capability-enforced lower-level input path used by playback and headless callers. */
  enqueueInputs(inputs: readonly PhysicsInput[]): void {
    validatePhysicsInputs(this.capabilities, inputs);
    this.world.enqueueInputs(resolveJointControllerInputs(inputs));
  }

  dispose(): void { this.world.dispose(); }

  private invalidateSnapshotsAfter(tick: number): void {
    [...this.snapshots.keys()]
      .filter((snapshotTick) => snapshotTick > tick)
      .forEach((snapshotTick) => this.snapshots.delete(snapshotTick));
  }

  reconcileDefinitions(definitions: readonly RigidBodyDefinition[], joints: readonly JointDefinition[] = []): void {
    validateJointDefinitions(this.capabilities, joints);
    this.world.reconcileDefinitions(definitions, joints);
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
    additionalInputs: readonly PhysicsInput[] = [],
  ): SimulationFrame {
    if (tick <= this.world.tick) throw new Error('Simulation frames must advance; use seek before replaying a prior tick.');
    this.invalidateSnapshotsAfter(this.world.tick);
    const transitions = interactionTransitions(this.previousFacts, facts);
    if (!this.capabilities.interactionMotorActuation && bindings.some(({ mode }) => mode.startsWith('joint-'))) {
      throw new Error(`${this.capabilities.label} rejects touch/breach motor actuation bindings.`);
    }
    const inputs: PhysicsInput[] = [...additionalInputs];
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
    bindings.filter((binding) => binding.mode.startsWith('joint-')).forEach((binding) => {
      const active = selectInteractionFact(binding, facts);
      const transition = transitions.find(({ fact }) => bindingMatchesFact(binding, fact));
      const phase = binding.phase ?? 'stay';
      if ((phase === 'stay' && active) || (phase === 'enter' && transition?.kind === 'enter')) {
        if (binding.jointId && Number.isFinite(binding.value)) inputs.push({ kind: binding.mode as 'joint-position-target' | 'joint-velocity-target' | 'joint-effort', jointId: binding.jointId, tick, stableSourceOrder, value: binding.value! });
      } else if (phase === 'leave' && transition?.kind === 'leave' && binding.jointId) {
        // A zero effort is the engine-neutral passive/release command; rest emits
        // an explicit bounded position target and hold retains the prior target.
        if (binding.leave === 'rest' && Number.isFinite(binding.restValue)) inputs.push({ kind: 'joint-position-target', jointId: binding.jointId, tick, stableSourceOrder, value: binding.restValue! });
        else if (binding.leave !== 'hold') inputs.push({ kind: 'joint-effort', jointId: binding.jointId, tick, stableSourceOrder, value: 0 });
      }
    });
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
        const distance = Math.min(cursorWeight / targetWeight / 100, 100);
        vector = unit.map((value) => value * distance) as Vector3Tuple;
      }
      inputs.push({ kind: 'translation', bodyId: binding.targetId, tick, stableSourceOrder, vector });
    });
    transitions.filter(({ kind }) => kind === 'enter').forEach(({ fact }) => {
      bindings.filter((binding) => binding.mode === 'impulse' && bindingMatchesFact(binding, fact)).forEach((binding) => {
        inputs.push({ kind: 'impulse', bodyId: binding.targetId, tick, stableSourceOrder, vector: direction(fact).map((value) => value * (binding.magnitude ?? 0)) as Vector3Tuple });
      });
    });
    this.enqueueInputs(inputs);
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
