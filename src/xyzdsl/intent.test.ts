import { describe, expect, it } from 'vitest';
import { parseXyzDslDocument } from './parser';
import { resolveXyzDslDocument } from './resolveDocument';

const secondary = new Map([[2, { sourceKind: 'secondary' as const, streamId: 'player-1', transactionId: 'tx-1' }]]);

describe('XYZDSL coordinate intents', () => {
  it('parses explicit stable body and joint targets with release behavior', () => {
    const body = parseXyzDslDocument('"Character/+1/+0/+1" : "intent: absolute; intent-target: body:root-id"', secondary);
    expect(body.value?.[0].intent?.target).toEqual({ kind: 'body', id: 'root-id' });
    const joint = parseXyzDslDocument('"Hand/+1/+0/+0" : "intent: absolute; intent-target: joint:finger-joint; intent-command: velocity; intent-release: brake"', secondary);
    expect(joint.value?.[0].intent?.target).toEqual({ kind: 'joint', id: 'finger-joint', command: 'velocity', release: 'brake' });
  });
  it('parses signed absolute and relative coordinates without geometry', () => {
    const parsed = parseXyzDslDocument('"Character/" : "max-speed: 6"\n"Character/+10/-2/+50c" : "intent: relative"', secondary);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.value?.[1].box).toBeUndefined();
    expect(parsed.value?.[1].intent).toEqual({ mode: 'relative', coordinate: [10, -2, 0.5] });
  });

  it('resolves a secondary intent against a primary definition', () => {
    const parsed = parseXyzDslDocument('"Character/" : "max-speed: 6; jump-speed: 8"\n"Character/+10/+0/+5" : "intent: absolute"', secondary);
    const resolved = resolveXyzDslDocument(parsed.value ?? []);
    expect(resolved.intents).toHaveLength(1);
    expect(resolved.intents[0]).toMatchObject({ id: 'player-1::Character/', coordinate: [10, 0, 5] });
    expect(resolved.intents[0].definition.physics).toMatchObject({ 'max-speed': 6, 'jump-speed': 8 });
    expect(resolved.objects).toHaveLength(0);
  });

  it('rejects intents that do not have secondary provenance', () => {
    const parsed = parseXyzDslDocument('"Character/" : ""\n"Character/+1/+0/+1" : "intent: absolute"');
    expect(resolveXyzDslDocument(parsed.value ?? []).diagnostics[0].message).toContain('secondary');
  });
});
