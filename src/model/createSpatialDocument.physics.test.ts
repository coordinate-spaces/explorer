import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from './createSpatialDocument';
import type { RigidBodyState } from '../physics/types';

describe('physics document overlay', () => {
  it('reads a completed frame without mutating or accumulating it', () => {
    const baseline = createSpatialDocument('"Ball/+0+1/+0+1/+0+1" : ""');
    const id = baseline.renderNodes[0].id;
    const state: RigidBodyState = { id, position: [4, 5, 6], orientation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false, tick: 7 };
    const frame = { tick: 7, states: new Map([[id, state]]) };
    const first = createSpatialDocument('"Ball/+0+1/+0+1/+0+1" : ""', { physicsFrame: frame });
    const second = createSpatialDocument('"Ball/+0+1/+0+1/+0+1" : ""', { physicsFrame: frame });
    expect(first.renderNodes[0].transform.position).toEqual([4, 5, 6]);
    expect(second.renderNodes[0].transform.position).toEqual([4, 5, 6]);
    expect(first.physicsTick).toBe(7);
  });

  it('applies completed rigid-body orientation as well as translation', () => {
    const baseline = createSpatialDocument('"Box/+0+1/+0+1/+0+1" : ""');
    const id = baseline.renderNodes[0].id;
    const halfTurn = Math.sin(Math.PI / 4);
    const state: RigidBodyState = { id, position: [0.5, 0.5, 0.5], orientation: [0, halfTurn, 0, halfTurn], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false, tick: 1 };
    const document = createSpatialDocument('"Box/+0+1/+0+1/+0+1" : ""', { physicsFrame: { tick: 1, states: new Map([[id, state]]) } });
    expect(document.renderNodes[0].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
  });
});
