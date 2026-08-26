import { parseContentDeclaration } from './contentParser';
import { parseGeometryDeclaration } from './geometryParser';
import { parseMaterialDeclaration, SUPPORTED_MATERIAL_KEYS } from './materialParser';
import { parsePropertyDeclarations } from './propertyParser';
import { parseReferenceDeclaration } from './referenceParser';
import { parseTransformDeclaration } from './transformParser';
import { parseModelDeclaration } from './modelParser';
import type {
  XyzDslContentSpec,
  XyzDslGeometrySpec,
  XyzDslMaterialSpec,
  XyzDslReferenceSpec,
  XyzDslTransformSpec,
} from './types';

const SUPPORTED_OBJECT_PROPERTIES = new Set([
  ...SUPPORTED_MATERIAL_KEYS,
  'geometry',
  'box-radius',
  'puff',
  'operation',
  'rotation',
  'rotate',
  'ref',
  'ref-scale',
  'content-kind',
  'content-text',
  'content-text-uri',
  'content-url',
  'content-url-uri',
  'model',
  'model-fit',
  'model-align',
]);

export interface XyzDslObjectPropertiesSpec {
  material: XyzDslMaterialSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  model: import('./types').XyzDslModelSpec;
  diagnostics: string[];
}

export function parseObjectProperties(source: string): XyzDslObjectPropertiesSpec {
  const { declarations, diagnostics } = parsePropertyDeclarations(source);
  const material = parseMaterialDeclaration(declarations);
  const geometry = parseGeometryDeclaration(declarations);
  const transform = parseTransformDeclaration(declarations);
  const reference = parseReferenceDeclaration(declarations);
  const content = parseContentDeclaration(declarations);
  const model = parseModelDeclaration(declarations);
  if (model.source && geometry.operation) {
    model.diagnostics.push('CSG operations are not supported for imported models.');
    geometry.operation = undefined;
  }
  const unsupportedDiagnostics = declarations
    .filter(({ property }) => !SUPPORTED_OBJECT_PROPERTIES.has(property))
    .map(
      ({ property }) => `Ignoring unsupported object property "${property}".`,
    );

  return {
    material,
    geometry,
    transform,
    reference,
    content,
    model,
    diagnostics: [
      ...diagnostics,
      ...material.diagnostics,
      ...geometry.diagnostics,
      ...transform.diagnostics,
      ...reference.diagnostics,
      ...content.diagnostics,
      ...model.diagnostics,
      ...unsupportedDiagnostics,
    ],
  };
}
