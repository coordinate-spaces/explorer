import type { XyzDslModelAlign, XyzDslModelFit, XyzDslModelSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

const FITS = new Set<XyzDslModelFit>(['contain', 'stretch']);
const ALIGNS = new Set<XyzDslModelAlign>(['center', 'floor']);

export function parseModelDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslModelSpec {
  const model: XyzDslModelSpec = { fit: 'contain', align: 'center', diagnostics: [] };
  const source = declarations.find(({ property }) => property === 'model');
  const fit = declarations.find(({ property }) => property === 'model-fit');
  const align = declarations.find(({ property }) => property === 'model-align');

  if (source) {
    const path = source.value.toLowerCase().split(/[?#]/, 1)[0];
    let invalidUrl = false;
    try {
      const absolute = new URL(source.value);
      invalidUrl = absolute.protocol !== 'http:' && absolute.protocol !== 'https:';
    } catch {
      invalidUrl = source.value.startsWith('//') || source.value.split('/').includes('..');
    }
    if (invalidUrl) {
      model.diagnostics.push('model must be an http(s) URL or a safe MODEL_STORE-relative path.');
    } else if (!path.endsWith('.glb')) {
      model.diagnostics.push('model must reference a .glb file.');
    } else {
      model.source = source.value;
      model.declared = true;
    }
  }
  if (fit) {
    if (FITS.has(fit.value as XyzDslModelFit)) model.fit = fit.value as XyzDslModelFit;
    else model.diagnostics.push(`Unsupported model-fit "${fit.value}". Expected contain or stretch.`);
  }
  if (align) {
    if (ALIGNS.has(align.value as XyzDslModelAlign)) model.align = align.value as XyzDslModelAlign;
    else model.diagnostics.push(`Unsupported model-align "${align.value}". Expected center or floor.`);
  }
  if ((fit || align) && !source) model.diagnostics.push('model-fit and model-align require a model declaration.');
  return model;
}
