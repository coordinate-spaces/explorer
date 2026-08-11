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

  it('does not use CSG tool volumes as collision obstacles', () => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([
      { ...body, id: 'Base/', entityId: 'component:Shape', bounds: { ...body.bounds, maxX: 4 } },
      { ...body, id: 'Cutter/', entityId: 'component:Shape', contributesToBounds: false, position: [3, 0, 0], bounds: { ...body.bounds, minX: 3, maxX: 6 } },
      { ...body, id: 'Neighbor/', entityOrder: 1, position: [5, 0, 0], bounds: { ...body.bounds, minX: 5, maxX: 6 } },
    ]);

    expect(world.frame().states.get('Neighbor/')?.position[0]).toBe(5);
    expect(world.frame().states.get('Cutter/')?.position[0]).toBe(3);
  });

  it('applies translations and impulses to every member of a rigid component', () => {
    const world = new PhysicsWorld(10);
    world.reconcileDefinitions([
      { ...body, id: 'PartA/', entityId: 'component:Parts', position: [10, 0, 0], bounds: { ...body.bounds, minX: 10, maxX: 11 } },
      { ...body, id: 'PartB/', entityId: 'component:Parts', position: [11, 0, 0], bounds: { ...body.bounds, minX: 11, maxX: 12 } },
    ]);
    world.enqueueInputs([
      { kind: 'translation', bodyId: 'PartA/', tick: 1, vector: [2, 0, 0] },
      { kind: 'impulse', bodyId: 'PartB/', tick: 1, vector: [2, 0, 0] },
    ]);
    const frame = world.step();

    expect(frame.states.get('PartA/')?.position[0]).toBeCloseTo(12.05);
    expect(frame.states.get('PartB/')?.position[0]).toBeCloseTo(13.05);
    expect(frame.states.get('PartA/')?.linearVelocity).toEqual(frame.states.get('PartB/')?.linearVelocity);
    expect(frame.states.get('PartA/')?.linearVelocity[0]).toBeCloseTo(0.5);
  });

  it('allows upward inputs to become airborne before gravity returns the body to support', () => {
    const world = new PhysicsWorld(10);
    world.reconcileDefinitions([body]);
    world.enqueueInputs([{ kind: 'impulse', bodyId: body.id, tick: 1, vector: [0, 4, 0] }]);

    expect(world.step().states.get(body.id)?.position[1]).toBeGreaterThan(0);
    expect(world.step(3).states.get(body.id)?.position[1]).toBe(0);
    expect(world.frame().states.get(body.id)?.linearVelocity[1]).toBe(0);
  });

  it('preserves an upward translation for its input tick and clamps downward penetration', () => {
    const world = new PhysicsWorld(10);
    world.reconcileDefinitions([body]);
    world.enqueueInputs([{ kind: 'translation', bodyId: body.id, tick: 1, vector: [0, 2, 0] }]);
    expect(world.step().states.get(body.id)?.position[1]).toBeGreaterThan(1.9);

    world.enqueueInputs([{ kind: 'translation', bodyId: body.id, tick: 2, vector: [0, -4, 0] }]);
    expect(world.step().states.get(body.id)?.position[1]).toBe(0);
  });

  it('rejects entities that mix rigid body modes', () => {
    const world = new PhysicsWorld();
    expect(() => world.reconcileDefinitions([
      { ...body, id: 'Dynamic/', entityId: 'mixed' },
      { ...body, id: 'Static/', entityId: 'mixed', mode: 'static' },
    ])).toThrow('Physics entity mixed cannot mix rigid body modes.');
  });

  it.each(['teleport', 'kinematic-target'] as const)('moves a whole component for a %s input', (kind) => {
    const world = new PhysicsWorld();
    world.reconcileDefinitions([
      { ...body, id: 'PartA/', entityId: 'component:Parts', position: [10, 0, 0], bounds: { ...body.bounds, minX: 10, maxX: 11 }, mode: 'kinematic' },
      { ...body, id: 'PartB/', entityId: 'component:Parts', position: [11, 0, 0], bounds: { ...body.bounds, minX: 11, maxX: 12 }, mode: 'kinematic' },
    ]);
    world.enqueueInputs([{ kind, bodyId: 'PartB/', tick: 1, position: [20, 0, 0] }]);
    const frame = world.step();

    expect(frame.states.get('PartA/')?.position[0]).toBe(19);
    expect(frame.states.get('PartB/')?.position[0]).toBe(20);
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
