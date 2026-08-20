import type {
  PhysicsFrame,
  InteractionQueryOptions,
  InteractionQueryResult,
  PhysicsInput,
  PhysicsSnapshot,
  QuaternionTuple,
  RigidBodyDefinition,
  RigidBodyState,
  Vector3Tuple,
} from './types';
import type { SpatialBounds } from '../model/SpatialNode';
import type { RigidBodyWorld } from './RigidBodyWorld';

export const DEFAULT_PHYSICS_HZ = 60;
export const DEFAULT_GRAVITY = -9.81;

const vector = (value: readonly number[]): Vector3Tuple => [value[0], value[1], value[2]];
const cloneState = (state: RigidBodyState): RigidBodyState => ({
  ...state,
  position: vector(state.position),
  orientation: [...state.orientation] as QuaternionTuple,
  linearVelocity: vector(state.linearVelocity),
  angularVelocity: vector(state.angularVelocity),
});

interface PhysicsEntity {
  id: string;
  bodyIds: string[];
  bounds: SpatialBounds;
  order: number;
}

const overlaps = (aMin: number, aMax: number, bMin: number, bMax: number): boolean =>
  aMin < bMax && aMax > bMin;

/** A renderer-independent, fixed-timestep state owner with deterministic world-space constraints. */
/** @deprecated Compatibility solver. New simulations should use RapierPhysicsWorld. */
export class PhysicsWorld implements RigidBodyWorld {
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
    const modesByEntity = new Map<string, Set<string>>();
    next.forEach((definition) => {
      const entityId = definition.entityId ?? definition.id;
      const modes = modesByEntity.get(entityId) ?? new Set<string>();
      modes.add(definition.mode ?? 'dynamic');
      modesByEntity.set(entityId, modes);
    });
    modesByEntity.forEach((modes, entityId) => {
      if (modes.size > 1) throw new Error(`Physics entity ${entityId} cannot mix rigid body modes.`);
    });
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
    this.resolveSpatialConstraints();
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

  /** The deprecated constraint solver has no geometry narrow phase. */
  queryInteractions(_options: InteractionQueryOptions = {}): readonly InteractionQueryResult[] { return Object.freeze([]); }

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

  dispose(): void {
    this.definitions.clear();
    this.states.clear();
    this.queuedInputs.clear();
  }

  private stepOnce(): void {
    const tick = this.currentTick + 1;
    const dt = 1 / this.ticksPerSecond;
    const inputs = [...(this.queuedInputs.get(tick) ?? [])].sort((a, b) =>
      (a.stableSourceOrder ?? 0) - (b.stableSourceOrder ?? 0) || a.bodyId.localeCompare(b.bodyId) || a.kind.localeCompare(b.kind));
    const entities = this.bodyIdsByEntity();
    const skipVerticalSettling = new Set<string>();
    [...entities].sort(([a], [b]) => a.localeCompare(b)).forEach(([, bodyIds]) => {
      const bodyIdSet = new Set(bodyIds);
      const entityInputs = inputs.filter((input) => bodyIdSet.has(input.bodyId));
      const states = bodyIds.map((id) => this.states.get(id)!);
      const definitions = bodyIds.map((id) => this.definitions.get(id)!);
      const direct = entityInputs.filter((input) => input.kind === 'teleport' || input.kind === 'kinematic-target').at(-1);
      if (direct && 'position' in direct) {
        const targetState = this.states.get(direct.bodyId)!;
        const delta = direct.position.map((value, axis) => value - targetState.position[axis]) as Vector3Tuple;
        if (delta[1] > 0) skipVerticalSettling.add(this.definitions.get(direct.bodyId)?.entityId ?? direct.bodyId);
        states.forEach((state) => {
          state.position = state.position.map((value, axis) => value + delta[axis]) as Vector3Tuple;
          if (direct.kind === 'teleport' && direct.clearVelocity) state.linearVelocity = [0, 0, 0];
        });
      }
      entityInputs.forEach((input) => {
        if (input.kind === 'joint-motor') return;
        if (input.kind === 'translation') {
          if (input.vector[1] > 0) skipVerticalSettling.add(this.definitions.get(input.bodyId)?.entityId ?? input.bodyId);
          states.forEach((state) => {
            state.position = state.position.map((component, axis) => component + input.vector[axis]) as Vector3Tuple;
          });
        } else if (input.kind === 'orientation') {
          const current = states[0].orientation;
          const [tx, ty, tz, tw] = input.orientation;
          const [cx, cy, cz, cw] = current;
          // target * inverse(current) is the entity-wide rotation delta.
          const delta: QuaternionTuple = [
            -tw * cx + tx * cw - ty * cz + tz * cy,
            -tw * cy + tx * cz + ty * cw - tz * cx,
            -tw * cz - tx * cy + ty * cx + tz * cw,
            tw * cw + tx * cx + ty * cy + tz * cz,
          ];
          states.forEach((state) => {
            const [x, y, z, w] = state.orientation;
            state.orientation = [
              delta[3] * x + delta[0] * w + delta[1] * z - delta[2] * y,
              delta[3] * y - delta[0] * z + delta[1] * w + delta[2] * x,
              delta[3] * z + delta[0] * y - delta[1] * x + delta[2] * w,
              delta[3] * w - delta[0] * x - delta[1] * y - delta[2] * z,
            ];
          });
        }
      });
      const dynamic = (definitions[0].mode ?? 'dynamic') === 'dynamic';
      if (dynamic) {
        const velocity = vector(states[0].linearVelocity);
        const entityMass = definitions
          .filter((definition) => definition.contributesToBounds !== false)
          .reduce((mass, definition) => mass + (definition.mass ?? 1), 0) || 1;
        entityInputs.forEach((input) => {
          if (input.kind !== 'force' && input.kind !== 'impulse') return;
          if (input.vector[1] > 0) skipVerticalSettling.add(this.definitions.get(input.bodyId)?.entityId ?? input.bodyId);
          const scale = input.kind === 'force' ? dt / entityMass : 1 / entityMass;
          input.vector.forEach((component, axis) => { velocity[axis] += component * scale; });
        });
        velocity[1] += DEFAULT_GRAVITY * dt;
        const damping = Math.max(0, Math.min(1, definitions[0].linearDamping ?? 0));
        const dampedVelocity = velocity.map((component) => component * Math.max(0, 1 - damping * dt)) as Vector3Tuple;
        states.forEach((state) => {
          state.linearVelocity = vector(dampedVelocity);
          state.position = state.position.map((component, axis) => component + dampedVelocity[axis] * dt) as Vector3Tuple;
        });
      }
      states.forEach((state, index) => {
        state.tick = tick;
        state.sleeping = definitions[index].mode === 'static' || Math.hypot(...state.linearVelocity) < 1e-9;
      });
    });
    this.resolveSpatialConstraints(skipVerticalSettling);
    this.queuedInputs.delete(tick);
    this.currentTick = tick;
  }

  private bodyIdsByEntity(): Map<string, string[]> {
    const entities = new Map<string, string[]>();
    this.definitions.forEach((definition, id) => {
      const entityId = definition.entityId ?? id;
      entities.set(entityId, [...(entities.get(entityId) ?? []), id]);
    });
    return entities;
  }

  private resolveSpatialConstraints(skipVerticalSettling = new Set<string>()): void {
    const entitiesById = this.bodyIdsByEntity();
    const boundsFor = (bodyIds: readonly string[]): SpatialBounds => bodyIds
      .filter((id) => this.definitions.get(id)?.contributesToBounds !== false)
      .reduce<SpatialBounds>((combined, id) => {
        const definition = this.definitions.get(id)!;
        const state = this.states.get(id)!;
        const dx = state.position[0] - definition.position[0];
        const dy = state.position[1] - definition.position[1];
        const dz = state.position[2] - definition.position[2];
        const bounds = {
          minX: definition.bounds.minX + dx, maxX: definition.bounds.maxX + dx,
          minY: definition.bounds.minY + dy, maxY: definition.bounds.maxY + dy,
          minZ: definition.bounds.minZ + dz, maxZ: definition.bounds.maxZ + dz,
        };
        return {
          minX: Math.min(combined.minX, bounds.minX), maxX: Math.max(combined.maxX, bounds.maxX),
          minY: Math.min(combined.minY, bounds.minY), maxY: Math.max(combined.maxY, bounds.maxY),
          minZ: Math.min(combined.minZ, bounds.minZ), maxZ: Math.max(combined.maxZ, bounds.maxZ),
        };
      }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const entities = [...entitiesById]
      .filter(([, bodyIds]) => bodyIds.some((id) => this.definitions.get(id)?.contributesToBounds !== false))
      .map(([id, bodyIds]): PhysicsEntity => ({
        id,
        bodyIds,
        bounds: boundsFor(bodyIds),
        order: Math.min(...bodyIds.map((bodyId) => this.definitions.get(bodyId)?.entityOrder ?? 0)),
      })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const translate = (entity: PhysicsEntity, delta: Vector3Tuple): void => {
      entity.bodyIds.forEach((id) => {
        const state = this.states.get(id)!;
        state.position = state.position.map((value, axis) => value + delta[axis]) as Vector3Tuple;
      });
      entity.bounds = boundsFor(entity.bodyIds);
    };

    // Pack overlaps in the horizontal plane only. Stable entity ordering makes the
    // authored baseline the fixed obstacle and moves later entities.
    const placed: PhysicsEntity[] = [];
    entities.forEach((entity) => {
      while (placed.some((obstacle) =>
        overlaps(entity.bounds.minX, entity.bounds.maxX, obstacle.bounds.minX, obstacle.bounds.maxX) &&
        overlaps(entity.bounds.minY, entity.bounds.maxY, obstacle.bounds.minY, obstacle.bounds.maxY) &&
        overlaps(entity.bounds.minZ, entity.bounds.maxZ, obstacle.bounds.minZ, obstacle.bounds.maxZ))) {
        const candidates = placed.flatMap((obstacle): Vector3Tuple[] => [
          [obstacle.bounds.maxX - entity.bounds.minX, 0, 0],
          [obstacle.bounds.minX - entity.bounds.maxX, 0, 0],
          [0, 0, obstacle.bounds.maxZ - entity.bounds.minZ],
          [0, 0, obstacle.bounds.minZ - entity.bounds.maxZ],
        ]).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        const candidate = candidates.find((delta) => {
          const moved = {
            ...entity.bounds,
            minX: entity.bounds.minX + delta[0], maxX: entity.bounds.maxX + delta[0],
            minZ: entity.bounds.minZ + delta[2], maxZ: entity.bounds.maxZ + delta[2],
          };
          return !placed.some((obstacle) => overlaps(moved.minX, moved.maxX, obstacle.bounds.minX, obstacle.bounds.maxX) &&
            overlaps(moved.minY, moved.maxY, obstacle.bounds.minY, obstacle.bounds.maxY) &&
            overlaps(moved.minZ, moved.maxZ, obstacle.bounds.minZ, obstacle.bounds.maxZ));
        });
        if (!candidate) break;
        translate(entity, candidate);
      }
      placed.push(entity);
    });

    // Resolve from low to high so only ground-connected entities can support a stack.
    const grounded: PhysicsEntity[] = [];
    [...entities].sort((a, b) => a.bounds.minY - b.bounds.minY || a.id.localeCompare(b.id)).forEach((entity) => {
      const mode = this.definitions.get(entity.bodyIds[0])?.mode ?? 'dynamic';
      if (mode !== 'dynamic') {
        grounded.push(entity);
        return;
      }
      const movingUp = entity.bodyIds.some((id) => (this.states.get(id)?.linearVelocity[1] ?? 0) > 0);
      if (skipVerticalSettling.has(entity.id) || movingUp) return;
      const supportY = grounded
        .filter((support) => support.bounds.minY < entity.bounds.minY &&
          overlaps(entity.bounds.minX, entity.bounds.maxX, support.bounds.minX, support.bounds.maxX) &&
          overlaps(entity.bounds.minZ, entity.bounds.maxZ, support.bounds.minZ, support.bounds.maxZ))
        .reduce((highest, support) => Math.max(highest, support.bounds.maxY), 0);
      if (entity.bounds.minY !== supportY) translate(entity, [0, supportY - entity.bounds.minY, 0]);
      entity.bodyIds.forEach((id) => {
        const state = this.states.get(id)!;
        if (state.linearVelocity[1] < 0) state.linearVelocity[1] = 0;
        state.sleeping = Math.hypot(...state.linearVelocity) < 1e-9;
      });
      grounded.push(entity);
    });
  }
}
