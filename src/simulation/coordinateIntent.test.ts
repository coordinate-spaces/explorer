import { describe, expect, it } from 'vitest';
import { CoordinateIntentReducer, coordinateIntentInputs } from './coordinateIntent';
import type { RigidBodyState } from '../physics/types';

const state: RigidBodyState = { id: 'body', position: [0, 0, 0], orientation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false, tick: 0 };

describe('coordinate intent simulation', () => {
  it('replaces absolute pointers and accumulates each relative frame once', () => {
    const reducer = new CoordinateIntentReducer();
    expect(reducer.apply({ id: 'p', mode: 'absolute', coordinate: [10, 0, 5], frameId: '1' }).pointer).toEqual([10, 0, 5]);
    expect(reducer.apply({ id: 'p', mode: 'relative', coordinate: [2, 0, -1], frameId: '2' }).pointer).toEqual([12, 0, 4]);
    expect(reducer.apply({ id: 'p', mode: 'absolute', coordinate: [10, 0, 5], frameId: '1' }).pointer).toEqual([12, 0, 4]);
    expect(reducer.apply({ id: 'p', mode: 'relative', coordinate: [2, 0, -1], frameId: '2' }).pointer).toEqual([12, 0, 4]);
  });

  it('turns toward the pointer at the configured bounded rate', () => {
    const result = coordinateIntentInputs('body', state, [10, 0, 0], { diagnostics: [], 'max-turn-rate': 60 }, 1, true);
    const orientation = result.inputs.find((input) => input.kind === 'orientation');
    expect(orientation).toMatchObject({ kind: 'orientation' });
    if (orientation?.kind === 'orientation') expect(orientation.orientation[1]).toBeCloseTo(Math.sin(Math.PI / 360));
  });

  it('does not snap facing after arriving', () => {
    const result = coordinateIntentInputs('body', state, [0, 0, 0], { diagnostics: [] }, 1, true);
    expect(result.inputs.some((input) => input.kind === 'orientation')).toBe(false);
  });

  it('preserves pitch and roll when the turn rate is zero', () => {
    const orientation: [number, number, number, number] = [0.2, 0.3, -0.1, Math.sqrt(0.86)];
    const result = coordinateIntentInputs('body', { ...state, orientation }, [10, 0, 0], { diagnostics: [], 'max-turn-rate': 0 }, 1, true);
    expect(result.inputs.find((input) => input.kind === 'orientation')).toMatchObject({ orientation });
  });

  it('uses the authored deceleration limit while slowing before arrival', () => {
    const moving = { ...state, linearVelocity: [5, 0, 0] as [number, number, number] };
    const result = coordinateIntentInputs('body', moving, [1, 0, 0], {
      diagnostics: [], 'max-speed': 10, 'max-acceleration': 1, 'max-deceleration': 12,
    }, 1, true);
    expect(result.inputs[0]).toMatchObject({ kind: 'impulse' });
    expect(Math.abs((result.inputs[0] as { vector: [number, number, number] }).vector[0])).toBeCloseTo(0.2);
  });

  it('bounds acceleration and derives facing from the pointer', () => {
    const result = coordinateIntentInputs('body', state, [10, 0, 0], { diagnostics: [], mass: 2, 'max-speed': 3, 'max-acceleration': 6 }, 1, true);
    expect(result.inputs[0]).toMatchObject({ kind: 'impulse', vector: [0.2, 0, 0] });
    expect(result.desiredYaw).toBe(90);
  });

  it('infers one grounded jump for an elevated target', () => {
    const laws = { diagnostics: [], 'jump-speed': 7, 'max-step-height': 0.5 };
    expect(coordinateIntentInputs('body', state, [1, 2, 0], laws, 1, true).jump).toBe(true);
    expect(coordinateIntentInputs('body', state, [1, 2, 0], laws, 1, false).jump).toBe(false);
  });
});
