import type { XyzDslIntentSpec, XyzDslResolvedIntentFrame } from './types';

export type TranslationTuple = [number, number, number];

/** Pure arithmetic shared by authored intent and interaction translation policy. */
export function composeAbsoluteTranslation(previous: TranslationTuple, displacement: TranslationTuple): TranslationTuple {
  return previous.map((value, axis) => value + displacement[axis]) as TranslationTuple;
}

export interface ResolveTranslationIntentResult {
  frame?: XyzDslResolvedIntentFrame;
  diagnostic?: string;
}

export function resolveTranslationIntent(
  intent: XyzDslIntentSpec,
  previousAbsolutePointer?: TranslationTuple,
  initialAnchor?: TranslationTuple,
): ResolveTranslationIntentResult {
  const base = previousAbsolutePointer ?? initialAnchor;
  if (intent.mode === 'relative' && !base) {
    return { diagnostic: `Relative intent for "${intent.definitionNamespace.join('/')}/" has no previous pointer or declared initial anchor.` };
  }
  const absolutePointer = intent.mode === 'absolute'
    ? [...intent.coordinates] as TranslationTuple
    : composeAbsoluteTranslation(base!, intent.coordinates);
  if (absolutePointer.some((component) => !Number.isFinite(component) || !Number.isSafeInteger(component * 100))) {
    return { diagnostic: `Intent for "${intent.definitionNamespace.join('/')}/" resolves outside the finite centiunit coordinate range.` };
  }
  return { frame: { ...intent, absolutePointer } };
}
