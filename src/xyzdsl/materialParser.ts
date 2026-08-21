import type { XyzDslMaterialSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

export const SUPPORTED_MATERIAL_KEYS = new Set(['color', 'metalness', 'roughness']);

function parseUnitMaterialProperty(property: string, value: string): { value?: number; diagnostic?: string } {
  const numericValue = Number(value);

  if (value.trim() === '' || !Number.isFinite(numericValue)) {
    return { diagnostic: `Material property "${property}" must be numeric.` };
  }

  if (numericValue < 0 || numericValue > 1) {
    return { diagnostic: `Material property "${property}" must be between 0 and 1.` };
  }

  return { value: numericValue };
}

export function parseMaterialDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslMaterialSpec {
  const material: XyzDslMaterialSpec = { diagnostics: [] };

  declarations
    .filter(({ property }) => SUPPORTED_MATERIAL_KEYS.has(property))
    .forEach(({ property, value }) => {
      if (property === 'color') {
        material.color = value.startsWith('0x') ? Number(value) : value;
        return;
      }

      const parsed = parseUnitMaterialProperty(property, value);
      if (parsed.diagnostic) {
        material.diagnostics.push(parsed.diagnostic);
        return;
      }

      if (property === 'metalness') material.metalness = parsed.value;
      if (property === 'roughness') material.roughness = parsed.value;
    });

  return material;
}
