import { describe, expect, it } from 'vitest';
import { RapierPhysicsWorld } from './RapierPhysicsWorld';
import type { RigidBodyDefinition } from './types';

const body: RigidBodyDefinition = {
  id: 'box', bounds: { minX: -0.5, maxX: 0.5, minY: 2, maxY: 3, minZ: -0.5, maxZ: 0.5 }, position: [0, 2.5, 0],
  colliders: [{ id: 'box-collider', bodyId: 'box', shape: 'cuboid', dimensions: [1, 1, 1], offset: [0, 0, 0] }],
};

describe('RapierPhysicsWorld', () => {
  it('integrates gravity and resolves a rigid-body contact with the ground', () => {
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([body]);
    expect(world.step().states.get('box')!.position[1]).toBeLessThan(2.5);
    expect(world.step(180).states.get('box')!.position[1]).toBeCloseTo(0.5, 2);
    world.dispose();
  });

  it('applies impulses and restores serializable snapshots', () => {
    const world = new RapierPhysicsWorld(60); world.reconcileDefinitions([body]);
    const snapshot = world.snapshot();
    world.enqueueInputs([{ kind: 'impulse', bodyId: 'box', tick: 1, vector: [3, 0, 0] }]);
    const moved = world.step(20).states.get('box')!.position[0];
    expect(moved).toBeGreaterThan(0);
    world.restore(snapshot);
    expect(world.frame().states.get('box')!.position).toEqual(body.position);
    world.dispose();
  });
});
