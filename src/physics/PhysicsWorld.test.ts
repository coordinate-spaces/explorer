import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from './PhysicsWorld';

const body = { id: 'Ball/', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }, position: [0, 0, 0] as [number, number, number], mass: 2 };

describe('PhysicsWorld', () => {
  it('drops floating bodies to the ground', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([{ ...body, bounds: { ...body.bounds, minY: 5, maxY: 6 }, position: [0, 5, 0] }]);
    expect(world.frame().states.get(body.id)?.position[1]).toBe(0);
  });

  it('builds grounded stacks on the highest overlapping support', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([
      body,
      { ...body, id: 'Middle/', bounds: { ...body.bounds, minY: 4, maxY: 5 }, position: [0, 4, 0], entityOrder: 1 },
      { ...body, id: 'Top/', bounds: { ...body.bounds, minY: 8, maxY: 9 }, position: [0, 8, 0], entityOrder: 2 },
    ]);
    expect(world.frame().states.get('Middle/')?.position[1]).toBe(1);
    expect(world.frame().states.get('Top/')?.position[1]).toBe(2);
  });

  it('does not stack bodies whose horizontal footprints only touch', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([
      body,
      { ...body, id: 'Floating/', bounds: { minX: 1, maxX: 2, minY: 5, maxY: 6, minZ: 0, maxZ: 1 }, position: [1, 5, 0], entityOrder: 1 },
    ]);
    expect(world.frame().states.get('Floating/')?.position[1]).toBe(0);
  });

  it('packs horizontal overlaps while preserving component offsets', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([
      body,
      { ...body, id: 'PartA/', entityId: 'component:Parts', entityOrder: 1 },
      { ...body, id: 'PartB/', entityId: 'component:Parts', entityOrder: 1, bounds: { ...body.bounds, minX: 1, maxX: 2 }, position: [1, 0, 0] },
    ]);
    const a = world.frame().states.get('PartA/')!.position;
    const b = world.frame().states.get('PartB/')!.position;
    expect(a[0]).toBe(1);
    expect(b[0] - a[0]).toBe(1);
    expect(a[1]).toBe(0);
  });

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

  it('resets state across body revisions and removes deleted bodies', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([body]);
    world.enqueueInputs([{ kind: 'impulse', bodyId: body.id, tick: 1, vector: [2, 0, 0] }]);
    world.step();
    world.reconcileDefinitions([{ ...body, revision: 'replacement', position: [8, 0, 0], mass: 4 }]);
    expect(world.frame().states.get(body.id)?.position[0]).toBe(8);
    world.reconcileDefinitions([]);
    expect(world.frame().states.has(body.id)).toBe(false);
  });
});
