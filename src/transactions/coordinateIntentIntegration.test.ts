import { describe, expect, it, vi } from 'vitest';
import { AccumulativeSpatialTimeline } from './AccumulativeSpatialTimeline';
import { compilePhysicsScene } from '../physics/compilePhysicsScene';

const source = [
  '"Character/" : "physics-mode: dynamic; max-speed: 4; max-acceleration: 60; max-deceleration: 60"',
  '"Character/Body/+0+1/+0+2/+0+1" : "geometry: box; physical-body: true; gravity-scale: 0"',
  '"Character/+10/+0/+0" : "intent: absolute"',
].join('\n');
const origins = new Map([[3, {
  sourceKind: 'secondary' as const, streamId: 'player-1', transactionId: 'intent-1', transactionTime: 1,
}]]);

describe('coordinate intent production integration', () => {
  it('emits the configured joint release when a cursor intent disappears', () => {
    const baseline = '"Hand/" : ""';
    const active = `${baseline}\n"Hand/+1/+0/+0" : "intent: absolute; intent-target: joint:finger; intent-command: position; intent-release: brake"`;
    const activeOrigins = new Map([[2, { sourceKind: 'secondary' as const, streamId: 'hand', transactionId: 'press' }]]);
    const timeline = new AccumulativeSpatialTimeline('joint-release-baseline');
    const enqueue = vi.spyOn(timeline.simulation.world, 'enqueueInputs');
    timeline.evaluate(active, activeOrigins);
    expect(enqueue.mock.calls.at(-1)?.[0]).toContainEqual(expect.objectContaining({ kind: 'joint-position-target', jointId: 'finger', value: 1 }));
    const retargeted = active.replace('joint:finger', 'joint:thumb');
    timeline.evaluate(retargeted, new Map([[2, { sourceKind: 'secondary' as const, streamId: 'hand', transactionId: 'retarget' }]]));
    expect(enqueue.mock.calls.at(-1)?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'joint-velocity-target', jointId: 'finger', value: 0 }),
      expect.objectContaining({ kind: 'joint-position-target', jointId: 'thumb', value: 1 }),
    ]));
    timeline.evaluate(baseline);
    expect(enqueue.mock.calls.at(-1)?.[0]).toContainEqual(expect.objectContaining({ kind: 'joint-velocity-target', jointId: 'thumb', value: 0 }));
    timeline.dispose();
  });
  it('materializes a definition runtime body and feeds its intent into fixed-step physics', () => {
    const timeline = new AccumulativeSpatialTimeline('intent-baseline');
    const compiled = timeline.compile(source, origins);
    const runtime = compiled.document.renderNodes.find((node) => node.metadata?.intentId === 'player-1::Character/');
    expect(runtime).toBeDefined();
    expect(compiled.document.intents).toHaveLength(1);
    expect(compilePhysicsScene(compiled.document).find((definition) => definition.id === runtime!.id)?.colliders?.[0].sensor).toBe(false);

    const before = runtime!.worldTransform!.position[0];
    let frame = timeline.evaluate(source, origins);
    for (let index = 0; index < 4; index += 1) frame = timeline.evaluate(source, origins);
    const moved = frame.document.renderNodes.find((node) => node.id === runtime!.id);
    expect(moved!.worldTransform!.position[0]).toBeGreaterThan(before);
    timeline.dispose();
  });

  it('uses solver collisions instead of passing through baseline obstacles', () => {
    const collisionSource = [
      '"Character/" : "physics-mode: dynamic; max-speed: 4; max-acceleration: 60; max-deceleration: 60"',
      '"Character/Body/+0+1/+0+1/+0+1" : "gravity-scale: 0; lock-rotations: x,z"',
      '"Wall/+2+1/+0+2/+0+4" : "physics-mode: static"',
      '"Character/+10/+0/+0" : "intent: absolute"',
    ].join('\n');
    const collisionOrigins = new Map([[4, { sourceKind: 'secondary' as const, streamId: 'player-1', transactionId: 'intent-1' }]]);
    const timeline = new AccumulativeSpatialTimeline('collision-baseline');
    timeline.compile(collisionSource, collisionOrigins);
    let frame = timeline.evaluate(collisionSource, collisionOrigins);
    for (let index = 0; index < 180; index += 1) frame = timeline.evaluate(collisionSource, collisionOrigins);
    const runtime = frame.document.renderNodes.find((node) => node.metadata?.intentId === 'player-1::Character/');
    expect(runtime!.worldTransform!.position[0]).toBeLessThan(1.6);
    timeline.dispose();
  });
});
