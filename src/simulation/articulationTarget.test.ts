import { describe, expect, it } from 'vitest';
import type { JointDefinition } from '../physics/types';
import { resolveArticulationTarget } from './articulationTarget';

const joint = (id: string, parentEntityId: string, childEntityId: string): JointDefinition => ({
  id, kind: 'revolute', parentEntityId, childEntityId,
  parentAnchor: [0, 0, 0], childAnchor: [0, 0, 0], parentAxis: [0, 0, 1], childAxis: [0, 0, 1],
});
const joints = [
  joint('shoulder', 'torso', 'upper'), joint('elbow', 'upper', 'forearm'),
  joint('wrist', 'forearm', 'hand'), joint('index', 'hand', 'finger'),
  joint('thumb', 'hand', 'thumb-tip'), joint('unrelated', 'other-root', 'other-child'),
];

describe('resolveArticulationTarget', () => {
  it('resolves one body or its complete ancestor chain', () => {
    expect(resolveArticulationTarget(joints, 'finger', 'body').jointIds).toEqual(['index']);
    expect(resolveArticulationTarget(joints, 'finger', 'chain')).toMatchObject({ rootBodyId: 'torso', jointIds: ['shoulder', 'elbow', 'wrist', 'index'] });
  });

  it('resolves descendants for subtree precision', () => {
    expect(resolveArticulationTarget(joints, 'forearm', 'subtree')).toMatchObject({ bodyIds: ['forearm', 'hand', 'finger', 'thumb-tip'], jointIds: ['wrist', 'index', 'thumb'] });
  });

  it('resolves a component from its root without leaking unrelated articulations', () => {
    expect(resolveArticulationTarget(joints, 'finger', 'component')).toMatchObject({
      rootBodyId: 'torso',
      bodyIds: ['torso', 'upper', 'forearm', 'hand', 'finger', 'thumb-tip'],
      jointIds: ['shoulder', 'elbow', 'wrist', 'index', 'thumb'],
    });
  });
});
