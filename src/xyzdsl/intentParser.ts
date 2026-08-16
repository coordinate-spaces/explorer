import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { XyzDslIntentMode } from './types';

export function parseIntentDeclaration(declarations: readonly XyzDslPropertyDeclaration[]): {
  mode?: XyzDslIntentMode;
  diagnostics: string[];
} {
  const intents = declarations.filter(({ property }) => property === 'intent');
  if (intents.length === 0) return { diagnostics: [] };
  if (intents.length > 1) return { diagnostics: ['Property "intent" may be declared only once.'] };
  const value = intents[0].value;
  if (value !== 'absolute' && value !== 'relative') {
    return { diagnostics: [`Unknown intent mode "${value}". Expected absolute or relative.`] };
  }
  return { mode: value, diagnostics: [] };
}
