import type { CoordinateSpaceDimensions } from '../model/coordinateSpace';

export const LOCAL_CURSOR_STREAM_ID = 'local-simulation';
export const LOCAL_CURSOR_NAMESPACE = 'LocalCursor/';

export interface LocalCursorPose {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  sequence: number;
}

export interface LocalCursorInput {
  forward: number;
  right: number;
  up: number;
  yawDelta: number;
  pitchDelta: number;
  deltaSeconds: number;
}

export const DEFAULT_LOCAL_CURSOR_POSE: LocalCursorPose = {
  position: [6, 1, 4],
  rotation: [0, 0, 0],
  size: [0.5, 0.5, 0.5],
  sequence: 0,
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
const wrap = (value: number, span: number) => span > 0 ? ((value % span) + span) % span : 0;

export function advanceLocalCursor(
  pose: LocalCursorPose,
  input: LocalCursorInput,
  coordinateSpace: CoordinateSpaceDimensions,
  speed = 4,
): LocalCursorPose {
  const yaw = pose.rotation[1] + input.yawDelta;
  const pitch = clamp(pose.rotation[0] + input.pitchDelta, -89, 89);
  const inputLength = Math.hypot(input.forward, input.right);
  const scale = inputLength > 1 ? 1 / inputLength : 1;
  const distance = Math.max(0, speed) * clamp(input.deltaSeconds, 0, 0.1);
  const yawRadians = yaw * Math.PI / 180;
  const forward = input.forward * scale;
  const right = input.right * scale;
  const dx = (Math.sin(yawRadians) * forward + Math.cos(yawRadians) * right) * distance;
  const dz = (-Math.cos(yawRadians) * forward + Math.sin(yawRadians) * right) * distance;
  const maxY = Math.max(0, coordinateSpace.height - pose.size[1]);

  return {
    ...pose,
    position: [
      wrap(pose.position[0] + dx, coordinateSpace.width),
      clamp(pose.position[1] + input.up * distance, 0, maxY),
      wrap(pose.position[2] + dz, coordinateSpace.depth),
    ],
    rotation: [pitch, yaw, 0],
    sequence: pose.sequence + 1,
  };
}

function centiunit(value: number, minimum = 0): string {
  return `${Math.max(minimum, Math.round(Math.max(0, value) * 100))}c`;
}

export function localCursorXyzDsl(pose: LocalCursorPose): string {
  const axes = pose.position.map((position, axis) => `+${centiunit(position)}+${centiunit(pose.size[axis], 1)}`);
  const rotation = pose.rotation.map((value) => Number.isFinite(value) ? Number(value.toFixed(3)) : 0);
  return `"${LOCAL_CURSOR_NAMESPACE}${axes.join('/')}" : "rotation: ${rotation.join(',')} ; color: 0x22d3ee; opacity: 0.7"`;
}
