import type { PhysicsInput, RigidBodyState, Vector3Tuple } from '../physics/types';
import type { XyzDslIntentMode, XyzDslPhysicsSpec } from '../xyzdsl/types';

export interface CoordinateIntentFrame {
  id: string;
  mode: XyzDslIntentMode;
  coordinate: Vector3Tuple;
  frameId: string;
}

export interface ResolvedCoordinateIntent {
  id: string;
  pointer: Vector3Tuple;
  frameId: string;
}

/** Reduces transaction expressions. A frame id is applied at most once. */
export class CoordinateIntentReducer {
  private states = new Map<string, ResolvedCoordinateIntent>();

  apply(frame: CoordinateIntentFrame, initial: Vector3Tuple = [0, 0, 0]): ResolvedCoordinateIntent {
    const previous = this.states.get(frame.id);
    if (previous?.frameId === frame.frameId) return previous;
    const pointer = frame.mode === 'absolute'
      ? [...frame.coordinate] as Vector3Tuple
      : frame.coordinate.map((value, axis) => value + (previous?.pointer[axis] ?? initial[axis])) as Vector3Tuple;
    const resolved = { id: frame.id, pointer, frameId: frame.frameId };
    this.states.set(frame.id, resolved);
    return resolved;
  }

  get(id: string): ResolvedCoordinateIntent | undefined { return this.states.get(id); }
  reset(): void { this.states.clear(); }
}

export interface CharacterControllerResult {
  inputs: PhysicsInput[];
  desiredYaw: number;
  arrived: boolean;
  jump: boolean;
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** Converts a pointer into bounded forces; it never sets or teleports a pose. */
export function coordinateIntentInputs(
  bodyId: string,
  state: RigidBodyState,
  pointer: Vector3Tuple,
  physics: XyzDslPhysicsSpec,
  tick: number,
  grounded: boolean,
): CharacterControllerResult {
  const dx = pointer[0] - state.position[0];
  const dz = pointer[2] - state.position[2];
  const distance = Math.hypot(dx, dz);
  const arrival = physics['arrival-radius'] ?? 0.1;
  const maxSpeed = physics['max-speed'] ?? 4;
  const acceleration = physics['max-acceleration'] ?? 12;
  const deceleration = physics['max-deceleration'] ?? acceleration;
  const mass = physics.mass ?? 1;
  const desiredSpeed = distance <= arrival ? 0 : Math.min(maxSpeed, Math.sqrt(2 * deceleration * Math.max(0, distance - arrival)));
  const desiredVelocity: Vector3Tuple = distance > 0 ? [dx / distance * desiredSpeed, 0, dz / distance * desiredSpeed] : [0, 0, 0];
  const dv: Vector3Tuple = [desiredVelocity[0] - state.linearVelocity[0], 0, desiredVelocity[2] - state.linearVelocity[2]];
  const dvLength = Math.hypot(dv[0], dv[2]);
  const limit = (desiredSpeed === 0 ? deceleration : acceleration) / 60;
  const boundedDv = dvLength > limit && dvLength > 0 ? [dv[0] / dvLength * limit, 0, dv[2] / dvLength * limit] as Vector3Tuple : dv;
  const inputs: PhysicsInput[] = [{ kind: 'impulse', bodyId, tick, vector: boundedDv.map((value) => value * mass) as Vector3Tuple }];

  const stepHeight = physics['max-step-height'] ?? 0.5;
  const jump = grounded && pointer[1] - state.position[1] > stepHeight && (physics['jump-speed'] ?? 0) > 0;
  if (jump) inputs.push({ kind: 'impulse', bodyId, tick, vector: [0, (physics['jump-speed'] ?? 0) * mass, 0] });
  const desiredYaw = distance > arrival ? Math.atan2(dx, -dz) * 180 / Math.PI : 0;
  return { inputs, desiredYaw: clamp(desiredYaw, 180), arrived: distance <= arrival, jump };
}
