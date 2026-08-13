import { describe, expect, it } from 'vitest';
import { advanceLocalCursor, DEFAULT_LOCAL_CURSOR_POSE, localCursorXyzDsl } from './localCursor';
import { parseXyzDslDeclaration } from '../xyzdsl/parser';

const room = { width: 40, height: 20, depth: 40 };

describe('local cursor simulation', () => {
  it('normalizes diagonal movement and moves relative to yaw', () => {
    const straight = advanceLocalCursor(DEFAULT_LOCAL_CURSOR_POSE, { forward: 1, right: 0, up: 0, yawDelta: 0, pitchDelta: 0, deltaSeconds: 0.1 }, room, 10);
    const diagonal = advanceLocalCursor(DEFAULT_LOCAL_CURSOR_POSE, { forward: 1, right: 1, up: 0, yawDelta: 0, pitchDelta: 0, deltaSeconds: 0.1 }, room, 10);
    expect(Math.hypot(diagonal.position[0] - 6, diagonal.position[2] - 4)).toBeCloseTo(1);
    expect(straight.position[2]).toBeCloseTo(3);
  });

  it('clamps pitch and height while wrapping horizontal movement', () => {
    const pose = { ...DEFAULT_LOCAL_CURSOR_POSE, position: [39.9, 19.4, 0.1] as [number, number, number] };
    const next = advanceLocalCursor(pose, { forward: 1, right: 1, up: 1, yawDelta: 0, pitchDelta: 100, deltaSeconds: 0.1 }, room, 10);
    expect(next.rotation[0]).toBe(89);
    expect(next.position[1]).toBe(19.5);
    expect(next.position[0]).toBeGreaterThanOrEqual(0);
    expect(next.position[0]).toBeLessThan(40);
  });

  it('serializes a complete, valid XYZDSL pose with rotation', () => {
    const source = localCursorXyzDsl({ ...DEFAULT_LOCAL_CURSOR_POSE, position: [12.5, 1, 8.4], rotation: [-12.5, 43.25, 0] });
    const parsed = parseXyzDslDeclaration(source);
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.box).toMatchObject({ x: 12.5, y: 1, z: 8.4, width: 0.5 });
    expect(parsed.value?.transform.rotation[1]).toBeCloseTo(43.25 * Math.PI / 180);
  });
});
