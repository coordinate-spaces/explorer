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
  private appliedFrames = new Map<string, Set<string>>();

  apply(frame: CoordinateIntentFrame, initial: Vector3Tuple = [0, 0, 0]): ResolvedCoordinateIntent {
    const previous = this.states.get(frame.id);
    const applied = this.appliedFrames.get(frame.id) ?? new Set<string>();
    if (applied.has(frame.frameId)) return previous ?? { id: frame.id, pointer: [...initial], frameId: frame.frameId };
    const pointer = frame.mode === 'absolute'
      ? [...frame.coordinate] as Vector3Tuple
      : frame.coordinate.map((value, axis) => value + (previous?.pointer[axis] ?? initial[axis])) as Vector3Tuple;
    const resolved = { id: frame.id, pointer, frameId: frame.frameId };
    this.states.set(frame.id, resolved);
    applied.add(frame.frameId);
    this.appliedFrames.set(frame.id, applied);
    return resolved;
  }

  get(id: string): ResolvedCoordinateIntent | undefined { return this.states.get(id); }
  reset(): void { this.states.clear(); this.appliedFrames.clear(); }
}

export interface CharacterControllerResult {
  inputs: PhysicsInput[];
  desiredYaw: number;
  arrived: boolean;
  jump: boolean;
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const radiansToDegrees = (value: number) => value * 180 / Math.PI;
const degreesToRadians = (value: number) => value * Math.PI / 180;
const shortestAngle = (value: number) => ((value + 540) % 360) - 180;

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
  const horizontalSpeed = Math.hypot(state.linearVelocity[0], state.linearVelocity[2]);
  const movingTowardTarget = distance > 0 && (state.linearVelocity[0] * dx + state.linearVelocity[2] * dz) > 0;
  const braking = desiredSpeed === 0 || (movingTowardTarget && horizontalSpeed > desiredSpeed);
  const limit = (braking ? deceleration : acceleration) / 60;
  const boundedDv = dvLength > limit && dvLength > 0 ? [dv[0] / dvLength * limit, 0, dv[2] / dvLength * limit] as Vector3Tuple : dv;
  const inputs: PhysicsInput[] = [{ kind: 'impulse', bodyId, tick, vector: boundedDv.map((value) => value * mass) as Vector3Tuple }];

  const stepHeight = physics['max-step-height'] ?? 0.5;
  const jump = grounded && pointer[1] - state.position[1] > stepHeight && (physics['jump-speed'] ?? 0) > 0;
  if (jump) inputs.push({ kind: 'impulse', bodyId, tick, vector: [0, (physics['jump-speed'] ?? 0) * mass, 0] });
  const desiredYaw = distance > arrival ? Math.atan2(dx, -dz) * 180 / Math.PI : 0;
  if (distance > arrival) {
    const [x, y, z, w] = state.orientation;
    const currentYaw = radiansToDegrees(Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z)));
    const turnLimit = (physics['max-turn-rate'] ?? 360) / 60;
    const yawDelta = clamp(shortestAngle(desiredYaw - currentYaw), turnLimit);
    const halfDelta = degreesToRadians(yawDelta) / 2;
    const sin = Math.sin(halfDelta);
    const cos = Math.cos(halfDelta);
    // Apply only the bounded world-y delta. Multiplying it into the retained
    // quaternion preserves pitch and roll from authored state or physics.
    inputs.push({ kind: 'orientation', bodyId, tick, orientation: [
      cos * x + sin * z,
      cos * y + sin * w,
      cos * z - sin * x,
      cos * w - sin * y,
    ] });
  }
  return { inputs, desiredYaw: clamp(desiredYaw, 180), arrived: distance <= arrival, jump };
}
