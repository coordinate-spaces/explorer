import { describe, expect, it } from 'vitest';
import { AccumulativeSpatialTimeline } from './AccumulativeSpatialTimeline';

const source = [
  '"Character/" : "physics-mode: dynamic; max-speed: 4; max-acceleration: 60; max-deceleration: 60"',
  '"Character/Body/+0+1/+0+2/+0+1" : "geometry: box; physical-body: true; gravity-scale: 0"',
  '"Character/+10/+0/+0" : "intent: absolute"',
].join('\n');
const origins = new Map([[3, {
  sourceKind: 'secondary' as const, streamId: 'player-1', transactionId: 'intent-1', transactionTime: 1,
}]]);

describe('coordinate intent production integration', () => {
  it('materializes a definition runtime body and feeds its intent into fixed-step physics', () => {
    const timeline = new AccumulativeSpatialTimeline('intent-baseline');
    const compiled = timeline.compile(source, origins);
    const runtime = compiled.document.renderNodes.find((node) => node.metadata?.intentId === 'player-1::Character/');
    expect(runtime).toBeDefined();
    expect(compiled.document.intents).toHaveLength(1);

    const before = runtime!.worldTransform!.position[0];
    let frame = timeline.evaluate(source, origins);
    for (let index = 0; index < 4; index += 1) frame = timeline.evaluate(source, origins);
    const moved = frame.document.renderNodes.find((node) => node.id === runtime!.id);
    expect(moved!.worldTransform!.position[0]).toBeGreaterThan(before);
    timeline.dispose();
  });
});
