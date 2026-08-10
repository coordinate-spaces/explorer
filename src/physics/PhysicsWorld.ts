import type {
  PhysicsFrame,
  PhysicsInput,
  PhysicsSnapshot,
  QuaternionTuple,
  RigidBodyDefinition,
  RigidBodyState,
  Vector3Tuple,
} from './types';

export const DEFAULT_PHYSICS_HZ = 60;

const vector = (value: readonly number[]): Vector3Tuple => [value[0], value[1], value[2]];
const cloneState = (state: RigidBodyState): RigidBodyState => ({
  ...state,
  position: vector(state.position),
  orientation: [...state.orientation] as QuaternionTuple,
  linearVelocity: vector(state.linearVelocity),
  angularVelocity: vector(state.angularVelocity),
});

/** A renderer-independent, fixed-timestep state owner. Collision response is intentionally pluggable. */
export class PhysicsWorld {
  private definitions = new Map<string, RigidBodyDefinition>();
  private states = new Map<string, RigidBodyState>();
  private queuedInputs = new Map<number, PhysicsInput[]>();
  private currentTick = 0;

  constructor(readonly ticksPerSecond = DEFAULT_PHYSICS_HZ) {
    if (!Number.isInteger(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new Error('Physics ticks per second must be a positive integer.');
    }
  }

  get tick(): number { return this.currentTick; }

  reconcileDefinitions(next: readonly RigidBodyDefinition[]): void {
    const nextIds = new Set(next.map(({ id }) => id));
    [...this.definitions.keys()].filter((id) => !nextIds.has(id)).forEach((id) => {
      this.definitions.delete(id);
      this.states.delete(id);
    });
    next.forEach((definition) => {
      const normalized = { ...definition, mass: definition.mass && definition.mass > 0 ? definition.mass : 1 };
      const previous = this.definitions.get(definition.id);
      this.definitions.set(definition.id, normalized);
      if (!previous || previous.revision !== normalized.revision) {
        this.states.set(definition.id, {
          id: definition.id,
          position: vector(definition.position),
          orientation: definition.orientation ? [...definition.orientation] : [0, 0, 0, 1],
          linearVelocity: [0, 0, 0],
          angularVelocity: [0, 0, 0],
          sleeping: definition.mode === 'static',
          tick: this.currentTick,
        });
      }
    });
  }

  enqueueInputs(inputs: readonly PhysicsInput[]): void {
    inputs.forEach((input) => {
      if (!Number.isInteger(input.tick) || input.tick <= this.currentTick) {
        throw new Error(`Physics input tick ${input.tick} must be after current tick ${this.currentTick}.`);
      }
      this.queuedInputs.set(input.tick, [...(this.queuedInputs.get(input.tick) ?? []), input]);
    });
  }

  step(targetTick = this.currentTick + 1): PhysicsFrame {
    if (!Number.isInteger(targetTick) || targetTick < this.currentTick) {
      throw new Error('Physics cannot step backward; restore a snapshot before replaying.');
    }
    while (this.currentTick < targetTick) this.stepOnce();
    return this.frame();
  }

  frame(): PhysicsFrame {
    return { tick: this.currentTick, states: new Map([...this.states].map(([id, state]) => [id, cloneState(state)])) };
  }

  snapshot(): PhysicsSnapshot {
    return {
      tick: this.currentTick,
      states: [...this.states.values()].map(cloneState),
      definitions: [...this.definitions.values()].map((definition) => ({ ...definition })),
    };
  }

  restore(snapshot: PhysicsSnapshot): void {
    this.currentTick = snapshot.tick;
    this.definitions = new Map(snapshot.definitions.map((definition) => [definition.id, { ...definition }]));
    this.states = new Map(snapshot.states.map((state) => [state.id, cloneState(state)]));
    this.queuedInputs.clear();
  }

  private stepOnce(): void {
    const tick = this.currentTick + 1;
    const dt = 1 / this.ticksPerSecond;
    const inputs = [...(this.queuedInputs.get(tick) ?? [])].sort((a, b) =>
      (a.stableSourceOrder ?? 0) - (b.stableSourceOrder ?? 0) || a.bodyId.localeCompare(b.bodyId) || a.kind.localeCompare(b.kind));
    const byBody = new Map<string, PhysicsInput[]>();
    inputs.forEach((input) => byBody.set(input.bodyId, [...(byBody.get(input.bodyId) ?? []), input]));

    [...this.states].sort(([a], [b]) => a.localeCompare(b)).forEach(([id, state]) => {
      const definition = this.definitions.get(id)!;
      const bodyInputs = byBody.get(id) ?? [];
      const direct = bodyInputs.filter((input) => input.kind === 'teleport' || input.kind === 'kinematic-target').at(-1);
      if (direct && 'position' in direct) {
        state.position = vector(direct.position);
        if (direct.kind === 'teleport' && direct.clearVelocity) state.linearVelocity = [0, 0, 0];
      }
      bodyInputs.forEach((input) => {
        if (input.kind === 'translation') {
          state.position = state.position.map((component, axis) => component + input.vector[axis]) as Vector3Tuple;
        }
      });
      if ((definition.mode ?? 'dynamic') === 'dynamic') {
        const mass = definition.mass ?? 1;
        bodyInputs.forEach((input) => {
          if (input.kind !== 'force' && input.kind !== 'impulse') return;
          const scale = input.kind === 'force' ? dt / mass : 1 / mass;
          state.linearVelocity = state.linearVelocity.map((component, axis) =>
            component + input.vector[axis] * scale) as Vector3Tuple;
        });
        const damping = Math.max(0, Math.min(1, definition.linearDamping ?? 0));
        state.linearVelocity = state.linearVelocity.map((component) => component * Math.max(0, 1 - damping * dt)) as Vector3Tuple;
        state.position = state.position.map((component, axis) => component + state.linearVelocity[axis] * dt) as Vector3Tuple;
      }
      state.tick = tick;
      state.sleeping = definition.mode === 'static' || Math.hypot(...state.linearVelocity) < 1e-9;
    });
    this.queuedInputs.delete(tick);
    this.currentTick = tick;
  }
}
