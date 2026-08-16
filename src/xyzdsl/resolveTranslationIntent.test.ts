import { describe, expect, it } from 'vitest';
import { parseXyzDslDocument } from './parser';
import { resolveXyzDslDocument } from './resolveDocument';
import { resolveTranslationIntent } from './resolveTranslationIntent';
import type { XyzDslIntentSpec } from './types';

const origin = { sourceKind: 'secondary', streamId: 'controller', transactionId: 'one' } as const;
const intent = (mode: 'absolute' | 'relative', coordinates: [number, number, number]): XyzDslIntentSpec => ({
  mode, coordinates, definitionNamespace: ['Character'], origin,
});

describe('translation intent', () => {
  it('replaces absolute pointers and composes relative displacement', () => {
    expect(resolveTranslationIntent(intent('absolute', [4, 5, 6]), [20, 20, 20]).frame?.absolutePointer).toEqual([4, 5, 6]);
    expect(resolveTranslationIntent(intent('relative', [-2, 1, 3]), [4, 5, 6]).frame?.absolutePointer).toEqual([2, 6, 9]);
  });

  it('uses an initial anchor and diagnoses its absence', () => {
    expect(resolveTranslationIntent(intent('relative', [2, 0, 0]), undefined, [7, 1, 3]).frame?.absolutePointer).toEqual([9, 1, 3]);
    expect(resolveTranslationIntent(intent('relative', [2, 0, 0])).diagnostic).toContain('no previous pointer');
  });

  it('parses signed Base64-safe tuples and rejects invalid modes', () => {
    const valid = parseXyzDslDocument('"Character/-2/+0/+3c" : "intent: relative"', new Map([[1, origin]]));
    expect(valid.value?.[0].intent?.coordinates).toEqual([-2, 0, 0.03]);
    const invalid = parseXyzDslDocument('"Character/+1/+0/+0" : "intent: nearby"', new Map([[1, origin]]));
    expect(invalid.diagnostics.map(({ message }) => message).join(' ')).toContain('Unknown intent mode "nearby"');
  });

  it('resolves transaction order, suppresses duplicate frames, and isolates streams', () => {
    const source = `"Character/+0+1/+0+1/+0+1" : ""
"Character/+2/+0/+0" : "intent: relative"
"Character/+9/+0/+0" : "intent: absolute"
"Character/+2/+0/+0" : "intent: relative"
"Character/+1/+0/+0" : "intent: relative"`;
    const origins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { ...origin, transactionId: 'later', transactionTime: 3, sourceOrder: 3 }],
      [3, { ...origin, transactionId: 'first', transactionTime: 1, sourceOrder: 1 }],
      [4, { ...origin, transactionId: 'later', transactionTime: 3, sourceOrder: 4 }],
      [5, { ...origin, streamId: 'other', transactionId: 'other', transactionTime: 2, sourceOrder: 2 }],
    ]);
    const parsed = parseXyzDslDocument(source, origins);
    const resolved = resolveXyzDslDocument(parsed.value!);
    expect(resolved.intents.map(({ absolutePointer }) => absolutePointer)).toEqual([[9, 0, 0], [1, 0, 0], [11, 0, 0]]);
  });

  it('keeps periodic-crossing pointers unwrapped', () => {
    expect(resolveTranslationIntent(intent('relative', [3, 0, 4]), [39, 0, 49]).frame?.absolutePointer).toEqual([42, 0, 53]);
  });
});
