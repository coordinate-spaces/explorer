import type { CoordinateSpaceDimensions } from '../model/coordinateSpace';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';

export const LOCAL_CURSOR_STREAM_ID = 'local-simulation';
export const LOCAL_CURSOR_NAMESPACE = 'LocalCursor/';

export interface LocalCoordinateIntent {
  namespace: string;
  controlTarget?: string;
  controlScope?: 'body' | 'chain' | 'subtree' | 'component';
  pointer: [number, number, number];
  heading: number;
  mode: 'absolute' | 'relative';
  sequence: number;
}

export const DEFAULT_LOCAL_COORDINATE_INTENT: LocalCoordinateIntent = {
  namespace: 'Character/', pointer: [6, 0, 4], heading: 0, mode: 'absolute', sequence: 0,
};

export function resetLocalCoordinateIntent(intent: LocalCoordinateIntent, namespace: string): LocalCoordinateIntent {
  return {
    ...DEFAULT_LOCAL_COORDINATE_INTENT,
    namespace,
    mode: intent.mode,
    controlTarget: intent.controlTarget,
    controlScope: intent.controlScope,
    pointer: intent.mode === 'relative' ? [0, 0, 0] : [...DEFAULT_LOCAL_COORDINATE_INTENT.pointer],
  };
}

/** Primary declaration-only namespaces that own at least one concrete descendant. */
export function localIntentDefinitions(source: string): string[] {
  const objects = parseXyzDslDocument(source).value ?? [];
  return objects.filter((object) => object.declarationOnly && object.namespace.length > 0)
    .filter((definition) => objects.some((candidate) => candidate.box && candidate.namespace.length > definition.namespace.length
      && definition.namespace.every((segment, index) => candidate.namespace[index] === segment)))
    .map((object) => canonicalNamespacePath(object.namespace))
    .filter((namespace, index, all) => all.indexOf(namespace) === index)
    .sort();
}

export interface LocalArticulationControls {
  targets: string[];
  defaultTarget?: string;
  defaultScope: NonNullable<LocalCoordinateIntent['controlScope']>;
}

/** Articulated body namespaces available beneath one controller definition. */
export function localArticulationControls(source: string, definitionNamespace: string): LocalArticulationControls {
  const objects = parseXyzDslDocument(source).value ?? [];
  const definition = objects.find((object) => object.declarationOnly && canonicalNamespacePath(object.namespace) === definitionNamespace);
  const segments = definitionNamespace.split('/').filter(Boolean);
  const targets = objects.filter((object) => object.box && object.physics.body
      && object.namespace.length > segments.length
      && segments.every((segment, index) => object.namespace[index] === segment))
    .map((object) => canonicalNamespacePath(object.namespace))
    .filter((namespace, index, all) => all.indexOf(namespace) === index)
    .sort();
  return {
    targets,
    defaultTarget: definition?.physics['control-target'],
    defaultScope: definition?.physics['control-scope'] ?? 'body',
  };
}

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
      // Preserve the emitted cursor's unwrapped coordinates. Secondary cursor
      // wrapping belongs to spatial-document projection, exactly as it does for
      // remote cursor declarations. XYZDSL path offsets are unsigned, so zero is
      // the only input-space boundary applied here.
      Math.max(0, pose.position[0] + dx),
      clamp(pose.position[1] + input.up * distance, 0, maxY),
      Math.max(0, pose.position[2] + dz),
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

/** Moves only the authoring pointer; character motion remains physics-owned. */
export function advanceLocalCoordinateIntent(intent: LocalCoordinateIntent, input: LocalCursorInput, pointerSpeed = 4): LocalCoordinateIntent {
  const heading = intent.heading + input.yawDelta;
  const radians = heading * Math.PI / 180;
  const length = Math.hypot(input.forward, input.right);
  const scale = length > 1 ? 1 / length : 1;
  const distance = Math.max(0, pointerSpeed) * clamp(input.deltaSeconds, 0, 0.1);
  const delta: [number, number, number] = [
    (Math.sin(radians) * input.forward + Math.cos(radians) * input.right) * scale * distance,
    input.up * distance,
    (-Math.cos(radians) * input.forward + Math.sin(radians) * input.right) * scale * distance,
  ];
  return { ...intent, heading, pointer: intent.mode === 'relative'
    ? delta
    : delta.map((value, axis) => value + intent.pointer[axis]) as [number, number, number], sequence: intent.sequence + 1 };
}

export function localCoordinateIntentXyzDsl(intent: LocalCoordinateIntent): string {
  const namespace = `${intent.namespace.replace(/\/+$/, '')}/`;
  const coordinate = intent.pointer.map((value) => {
    const centiunits = Math.round(value * 100);
    return `${centiunits < 0 ? '-' : '+'}${Math.abs(centiunits)}c`;
  });
  const control = intent.controlTarget
    ? `; control-target: ${intent.controlTarget}; control-scope: ${intent.controlScope ?? 'body'}`
    : '';
  return `"${namespace}${coordinate.join('/')}" : "intent: ${intent.mode}${control}"`;
}
