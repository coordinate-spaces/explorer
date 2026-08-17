import { describe, expect, it } from 'vitest';
import { advanceLocalCoordinateIntent, advanceLocalCursor, DEFAULT_LOCAL_COORDINATE_INTENT, DEFAULT_LOCAL_CURSOR_POSE, localCoordinateIntentXyzDsl, localCursorXyzDsl } from './localCursor';
import { parseXyzDslDeclaration } from '../xyzdsl/parser';
import { composeSpatialEditorSourceBundle } from '../transactions/composeTransactionSources';
import { createSpatialDocument } from '../model/createSpatialDocument';

const room = { width: 40, height: 20, depth: 40 };

describe('local cursor simulation', () => {
  it('authors an intent pointer without emitting character pose or size', () => {
    const intent = advanceLocalCoordinateIntent(DEFAULT_LOCAL_COORDINATE_INTENT, { forward: 1, right: 0, up: 0, yawDelta: 0, pitchDelta: 0, deltaSeconds: 0.1 });
    expect(intent.pointer).toEqual([6, 0, 3.6]);
    expect(localCoordinateIntentXyzDsl(intent)).toBe('"Character/+600c/+0c/+360c" : "intent: absolute"');
  });
  it('normalizes diagonal movement and moves relative to yaw', () => {
    const straight = advanceLocalCursor(DEFAULT_LOCAL_CURSOR_POSE, { forward: 1, right: 0, up: 0, yawDelta: 0, pitchDelta: 0, deltaSeconds: 0.1 }, room, 10);
    const diagonal = advanceLocalCursor(DEFAULT_LOCAL_CURSOR_POSE, { forward: 1, right: 1, up: 0, yawDelta: 0, pitchDelta: 0, deltaSeconds: 0.1 }, room, 10);
    expect(Math.hypot(diagonal.position[0] - 6, diagonal.position[2] - 4)).toBeCloseTo(1);
    expect(straight.position[2]).toBeCloseTo(3);
  });

  it('clamps pitch and height without wrapping emitted horizontal coordinates', () => {
    const pose = { ...DEFAULT_LOCAL_CURSOR_POSE, position: [39.9, 19.4, 0.1] as [number, number, number] };
    const next = advanceLocalCursor(pose, { forward: 1, right: 1, up: 1, yawDelta: 0, pitchDelta: 100, deltaSeconds: 0.1 }, room, 10);
    expect(next.rotation[0]).toBe(89);
    expect(next.position[1]).toBe(19.5);
    expect(next.position[0]).toBeGreaterThan(40);
    expect(next.position[2]).toBe(0);
  });

  it('leaves multi-span coordinates unwrapped for spatial-document projection', () => {
    const pose = { ...DEFAULT_LOCAL_CURSOR_POSE, position: [81, 1, 81] as [number, number, number] };
    const next = advanceLocalCursor(pose, { forward: 0, right: 0, up: 0, yawDelta: 1, pitchDelta: 0, deltaSeconds: 0.1 }, room);
    expect(next.position).toEqual([81, 1, 81]);
    expect(localCursorXyzDsl(next)).toContain('LocalCursor/+8100c+50c/+100c+50c/+8100c+50c');
  });

  it('relies on the shared secondary projection to wrap only rendered state', () => {
    const pose = { ...DEFAULT_LOCAL_CURSOR_POSE, position: [81, 1, 81] as [number, number, number] };
    const bundle = composeSpatialEditorSourceBundle('"Target/+1+1/+1+1/+1+1" : ""', [{
      id: 'local-simulation', declarations: localCursorXyzDsl(pose), bypassNamespacePolicy: true,
    }]);
    const document = createSpatialDocument(bundle.source, { originsByLine: bundle.originsByLine });
    const cursor = document.renderNodes.find((node) => node.namespacePath === 'LocalCursor/');

    expect(cursor?.box).toMatchObject({ x: 81, z: 81 });
    expect(cursor?.unwrappedTransform?.position).toEqual([81.25, 1.25, 81.25]);
    expect(cursor?.transform.position).toEqual([1.25, 1.25, 1.25]);
  });

  it('serializes a complete, valid XYZDSL pose with rotation', () => {
    const source = localCursorXyzDsl({ ...DEFAULT_LOCAL_CURSOR_POSE, position: [12.5, 1, 8.4], rotation: [-12.5, 43.25, 0] });
    const parsed = parseXyzDslDeclaration(source);
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.box).toMatchObject({ x: 12.5, y: 1, z: 8.4, width: 0.5 });
    expect(parsed.value?.transform.rotation[1]).toBeCloseTo(43.25 * Math.PI / 180);
  });
});
