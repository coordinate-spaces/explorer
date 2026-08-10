import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from './PhysicsWorld';

const body = { id: 'Ball/', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }, position: [0, 0, 0] as [number, number, number], mass: 2 };

describe('PhysicsWorld', () => {
  it('accumulates force on fixed ticks rather than render calls', () => {
    const world = new PhysicsWorld(10);
    world.reconcileDefinitions([body]);
    world.enqueueInputs([
      { kind: 'force', bodyId: body.id, tick: 1, vector: [2, 0, 0] },
      { kind: 'force', bodyId: body.id, tick: 2, vector: [2, 0, 0] },
    ]);
    expect(world.step(2).states.get(body.id)?.position[0]).toBeCloseTo(0.03);
    expect(world.frame().states.get(body.id)?.position[0]).toBeCloseTo(0.03);
  });

  it('restores snapshots for deterministic replay', () => {
    const world = new PhysicsWorld(10);
    world.reconcileDefinitions([body]);
    const initial = world.snapshot();
    world.enqueueInputs([{ kind: 'impulse', bodyId: body.id, tick: 1, vector: [2, 0, 0] }]);
    const first = world.step().states.get(body.id)?.position;
    world.restore(initial);
    world.enqueueInputs([{ kind: 'impulse', bodyId: body.id, tick: 1, vector: [2, 0, 0] }]);
    expect(world.step().states.get(body.id)?.position).toEqual(first);
  });

  it('preserves state across definition edits and removes deleted bodies', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([body]);
    world.enqueueInputs([{ kind: 'impulse', bodyId: body.id, tick: 1, vector: [2, 0, 0] }]);
    world.step();
    world.reconcileDefinitions([{ ...body, revision: 'resized', mass: 4 }]);
    expect(world.frame().states.get(body.id)?.position[0]).toBeGreaterThan(0);
    world.reconcileDefinitions([]);
    expect(world.frame().states.has(body.id)).toBe(false);
  });
});
