import { describe, expect, it } from 'vitest';
import { assertPublishedRenderNodeTransforms, createSpatialDocument } from './createSpatialDocument';
import type { RigidBodyState } from '../physics/types';

describe('physics document overlay', () => {
  it('requires either injected interaction facts or the explicitly named AABB compatibility path', () => {
    const source = '"Target/+0+4/+0+4/+0+4":"geometry: sphere"\n"Cursor/+3+4/+0+4/+3+4":"geometry: sphere"';
    const originsByLine = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'cursor' }],
    ]);

    expect(createSpatialDocument(source, { originsByLine }).interactions).toEqual([]);
    expect(createSpatialDocument(source, { originsByLine, interactionFacts: [] }).interactions).toEqual([]);
    expect(createSpatialDocument(source, { originsByLine, aabbInteractionCompatibility: true }).interactions)
      .toMatchObject([{ state: 'breach' }]);
  });
  it('propagates inherited and referenced physics independently from material', () => {
    const document = createSpatialDocument('"Template/" : "mass: 4; friction: .3"\n"Template/Part/+0+1/+0+1/+0+1" : "ccd: true"\n"Copy/+2+1/+0+1/+0+1" : "ref: Template/"');
    expect(document.renderNodes[0].physics).toMatchObject({ mass: 4, friction: .3, ccd: true });
    expect(document.renderNodes[0].material).not.toHaveProperty('mass');
  });
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

  it('rejects divergent world poses on published render nodes', () => {
    const node = createSpatialDocument('"Ball/+0+1/+0+1/+0+1" : ""').renderNodes[0];
    const divergent = {
      ...node,
      worldTransform: { ...node.worldTransform!, position: [node.transform.position[0] + 0.01, ...node.transform.position.slice(1)] as [number, number, number] },
    };
    expect(() => assertPublishedRenderNodeTransforms([divergent]))
      .toThrow(/divergent transform and worldTransform/);
  });

  it('applies completed rigid-body orientation as well as translation', () => {
    const baseline = createSpatialDocument('"Box/+0+1/+0+1/+0+1" : ""');
    const id = baseline.renderNodes[0].id;
    const halfTurn = Math.sin(Math.PI / 4);
    const state: RigidBodyState = { id, position: [0.5, 0.5, 0.5], orientation: [0, halfTurn, 0, halfTurn], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false, tick: 1 };
    const document = createSpatialDocument('"Box/+0+1/+0+1/+0+1" : ""', { physicsFrame: { tick: 1, states: new Map([[id, state]]) } });
    expect(document.renderNodes[0].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('recomputes interaction bounds from the completed orientation', () => {
    const source = '"Rod/+0+4/+0+1/+0+1" : ""';
    const baseline = createSpatialDocument(source);
    const id = baseline.renderNodes[0].id;
    const halfTurn = Math.sin(Math.PI / 4);
    const state: RigidBodyState = { id, position: [2, 0.5, 0.5], orientation: [0, halfTurn, 0, halfTurn], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false, tick: 1 };
    const node = createSpatialDocument(source, { physicsFrame: { tick: 1, states: new Map([[id, state]]) } }).renderNodes[0];
    expect(node.bounds.maxX - node.bounds.minX).toBeCloseTo(1);
    expect(node.bounds.maxZ - node.bounds.minZ).toBeCloseTo(4);
  });
});
