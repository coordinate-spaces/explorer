import type { XyzDslModelAlign, XyzDslModelFit, XyzDslModelSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import { resolveModelUrl } from '../model/resolveModelUrl';

const FITS = new Set<XyzDslModelFit>(['contain', 'stretch']);
const ALIGNS = new Set<XyzDslModelAlign>(['center', 'floor']);

export function parseModelDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslModelSpec {
  const model: XyzDslModelSpec = { fit: 'contain', align: 'center', diagnostics: [] };
  const source = declarations.find(({ property }) => property === 'model');
  const fit = declarations.find(({ property }) => property === 'model-fit');
  const align = declarations.find(({ property }) => property === 'model-align');

  if (source) {
    try {
      resolveModelUrl(source.value);
      model.source = source.value;
      model.declared = true;
      model.sourceDeclared = true;
    } catch (error) {
      model.diagnostics.push(error instanceof Error ? error.message : 'Model URL is invalid.');
    }
  }
  if (fit) {
    if (FITS.has(fit.value as XyzDslModelFit)) {
      model.fit = fit.value as XyzDslModelFit;
      model.declared = true;
      model.fitDeclared = true;
    }
    else model.diagnostics.push(`Unsupported model-fit "${fit.value}". Expected contain or stretch.`);
  }
  if (align) {
    if (ALIGNS.has(align.value as XyzDslModelAlign)) {
      model.align = align.value as XyzDslModelAlign;
      model.declared = true;
      model.alignDeclared = true;
    }
    else model.diagnostics.push(`Unsupported model-align "${align.value}". Expected center or floor.`);
  }
  return model;
}
