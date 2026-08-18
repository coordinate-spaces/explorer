import { describe, expect, it } from 'vitest';
import { RapierPhysicsWorld } from './RapierPhysicsWorld';
import type { JointDefinition, RigidBodyDefinition } from './types';

const body: RigidBodyDefinition = {
  id: 'box', bounds: { minX: -0.5, maxX: 0.5, minY: 2, maxY: 3, minZ: -0.5, maxZ: 0.5 }, position: [0, 2.5, 0],
  colliders: [{ id: 'box-collider', bodyId: 'box', shape: 'cuboid', dimensions: [1, 1, 1], offset: [0, 0, 0] }],
};

describe('RapierPhysicsWorld', () => {
  it('refreshes authored kinematic poses during structurally identical reconciliation', () => {
    const kinematic: RigidBodyDefinition = { ...body, mode: 'kinematic' };
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([kinematic]);
    world.enqueueInputs([{ kind: 'kinematic-target', bodyId: 'box', tick: 1, position: [4, 5, 6] }]);
    expect(world.step().states.get('box')!.position).toEqual([4, 5, 6]);
    world.reconcileDefinitions([kinematic]);
    expect(world.frame().states.get('box')!.position).toEqual(kinematic.position);
    expect(world.tick).toBe(1);
    world.dispose();
  });
  it('swings a revolute pendulum while retaining its pivot distance', () => {
    const anchor: RigidBodyDefinition = { ...body, id: 'anchor', entityId: 'anchor-body', mode: 'static', position: [0, 8.5, 0] };
    const rod: RigidBodyDefinition = { ...body, id: 'rod', entityId: 'rod-body', mass: 1, position: [0, 5.5, 0],
      colliders: [{ id: 'rod-collider', bodyId: 'rod', shape: 'cuboid', dimensions: [0.2, 5, 0.2], offset: [0, 0, 0] }] };
    const joint: JointDefinition = { id: 'hinge', kind: 'revolute', parentEntityId: 'anchor-body', childEntityId: 'rod-body',
      parentAnchor: [0, -0.5, 0], childAnchor: [0, 2.5, 0], parentAxis: [0, 0, 1], childAxis: [0, 0, 1] };
    const world = new RapierPhysicsWorld(60); world.reconcileDefinitions([anchor, rod], [joint]);
    world.enqueueInputs([{ kind: 'impulse', bodyId: 'rod', tick: 1, vector: [2, 0, 0] }]);
    const state = world.step(120).states.get('rod')!;
    expect(Math.abs(state.position[0])).toBeGreaterThan(0.1);
    expect(Math.hypot(state.position[0], state.position[1] - 8)).toBeCloseTo(2.5, 2);
    const snapshot = world.snapshot();
    expect(snapshot.joints).toEqual([joint]);
    world.restore(snapshot);
    expect(world.frame().states.get('rod')!.position).toEqual(state.position);
    world.dispose();
  });
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

  it('uses the declared total mass independently of collider volume', () => {
    const world = new RapierPhysicsWorld();
    const small = { ...body, position: [0, 20, 0] as [number, number, number], gravityScale: 0 };
    const large: RigidBodyDefinition = { ...body, id: 'large', position: [20, 20, 0], gravityScale: 0,
      colliders: [{ id: 'large-collider', bodyId: 'large', shape: 'cuboid', dimensions: [10, 10, 10], offset: [0, 0, 0] }] };
    world.reconcileDefinitions([small, large]);
    world.enqueueInputs([
      { kind: 'impulse', bodyId: 'box', tick: 1, vector: [2, 0, 0] },
      { kind: 'impulse', bodyId: 'large', tick: 1, vector: [2, 0, 0] },
    ]);
    const frame = world.step();
    expect(frame.states.get('box')!.linearVelocity[0]).toBeCloseTo(frame.states.get('large')!.linearVelocity[0]);
    world.dispose();
  });

  it('composes each compound member local pose with the body pose', () => {
    const halfTurn = Math.sin(Math.PI / 4);
    const anchor = { ...body, id: 'anchor', entityId: 'compound', mode: 'static' as const, position: [0, 1, 0] as [number, number, number], orientation: [0, halfTurn, 0, halfTurn] as [number, number, number, number] };
    const member = { ...body, id: 'member', entityId: 'compound', mode: 'static' as const, position: [1, 1, 0] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] };
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([anchor, member]);
    expect(world.frame().states.get('member')!.position[0]).toBeCloseTo(member.position[0]);
    expect(world.frame().states.get('member')!.position[1]).toBeCloseTo(member.position[1]);
    expect(world.frame().states.get('member')!.position[2]).toBeCloseTo(member.position[2]);
    expect(world.frame().states.get('member')!.orientation[1]).toBeCloseTo(0);

    const snapshot = world.snapshot();
    const anchorState = snapshot.states.find(({ id }) => id === 'anchor')!;
    anchorState.orientation = [0, 0, 0, 1];
    world.restore(snapshot);
    const rotatedMember = world.frame().states.get('member')!;
    expect(rotatedMember.position[0]).toBeCloseTo(0);
    expect(rotatedMember.position[2]).toBeCloseTo(1);
    expect(rotatedMember.orientation[1]).toBeCloseTo(-halfTurn);
    world.dispose();
  });

  const queryBody = (id: string, x: number, role: 'target' | 'cursor', shape: 'cuboid' | 'ball' | 'cylinder' = 'cuboid', dimensions: [number, number, number] = [2, 2, 2]): RigidBodyDefinition => ({
    id, mode: role === 'cursor' ? 'kinematic' : 'static', position: [x, 10, 0],
    bounds: { minX: x - 1, maxX: x + 1, minY: 9, maxY: 11, minZ: -1, maxZ: 1 },
    interactionIdentity: { id, namespace: `${id}/`, ...(role === 'cursor' ? { streamId: 'stream-a' } : {}) },
    colliders: [{ id: `${id}-collider`, bodyId: id, shape, dimensions, offset: [0, 0, 0], sensor: role === 'cursor',
      interactionRole: role, collisionGroups: role === 'cursor' ? (2 << 16) | 1 : (1 << 16) | 3 }],
  });

  it.each([
    ['sphere', 'ball' as const],
    ['cylinder', 'cylinder' as const],
    ['rotated box', 'cuboid' as const],
  ])('uses exact Rapier geometry for %s touch, tolerance, and penetration', (_label, shape) => {
    const target = queryBody('target', 0, 'target', shape);
    if (_label === 'rotated box') target.orientation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
    const touchingX = _label === 'rotated box' ? 1 + Math.SQRT2 : 2;
    const cursor = queryBody('cursor', touchingX, 'cursor', shape);
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([target, cursor]);
    expect(world.queryInteractions({ tolerance: 0 })[0]?.state).toBe('touch');
    world.reconcileDefinitions([target, { ...cursor, position: [touchingX + 0.0005, 10, 0] }]);
    expect(world.queryInteractions({ tolerance: 0.001 })[0]?.separation).toBeLessThanOrEqual(0.001);
    world.reconcileDefinitions([target, { ...cursor, position: [1.5, 10, 0] }]);
    expect(world.queryInteractions()[0]).toMatchObject({ state: 'breach', penetration: expect.any(Number), resolutionDistance: expect.any(Number) });
    world.dispose();
  });

  it('aggregates compound pairs deterministically and restores replay-safe query identity', () => {
    const target = queryBody('target', 0, 'target');
    target.colliders!.push({ ...target.colliders![0], id: 'target-collider-b', offset: [0.25, 0, 0] });
    const cursor = queryBody('cursor', 1.5, 'cursor');
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([target, cursor]);
    const before = world.queryInteractions(); const snapshot = world.snapshot();
    expect(before).toHaveLength(1);
    expect(world.queryInteractions()).toEqual(before);
    world.restore(snapshot);
    expect(world.queryInteractions()).toEqual(before);
    world.dispose();
  });

  it('keeps sensors impulse-free, honors filtering, and resolves periodic images without duplicates', () => {
    const target = queryBody('target', -4.5, 'target');
    const cursor = queryBody('cursor', 4.5, 'cursor');
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([target, cursor]);
    expect(world.queryInteractions({ periodicSpace: { width: 10, depth: 10 } })).toHaveLength(1);
    const filtered = { ...cursor, colliders: [{ ...cursor.colliders![0], collisionGroups: (2 << 16) | 4 }] };
    world.reconcileDefinitions([target, filtered]);
    expect(world.queryInteractions({ periodicSpace: { width: 10, depth: 10 } })).toEqual([]);
    expect(world.frame().states.get('target')!.linearVelocity).toEqual([0, 0, 0]);
    world.dispose();
  });

  it('retains simulated state and snapshots for opted-in physical sensor bodies', () => {
    const physicalSensor = queryBody('physical-sensor', 0, 'cursor');
    physicalSensor.mode = 'dynamic';
    physicalSensor.position = [0, 5, 0];
    physicalSensor.retainsPhysicsState = true;
    const world = new RapierPhysicsWorld(); world.reconcileDefinitions([physicalSensor]);
    const moved = world.step(10).states.get(physicalSensor.id)!;
    expect(moved.position[1]).toBeLessThan(5);
    const snapshot = world.snapshot();
    world.step(20);
    world.restore(snapshot);
    expect(world.frame().states.get(physicalSensor.id)).toEqual(moved);
    world.dispose();
  });
});
