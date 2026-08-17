import { parseContentDeclaration } from './contentParser';
import { parseGeometryDeclaration } from './geometryParser';
import { parseMaterialDeclaration, SUPPORTED_MATERIAL_KEYS } from './materialParser';
import { parsePropertyDeclarations } from './propertyParser';
import { parseReferenceDeclaration } from './referenceParser';
import { parseTransformDeclaration } from './transformParser';
import { parsePhysicsDeclaration, SUPPORTED_PHYSICS_KEYS } from './physicsParser';
import type {
  XyzDslContentSpec,
  XyzDslGeometrySpec,
  XyzDslMaterialSpec,
  XyzDslReferenceSpec,
  XyzDslTransformSpec,
  XyzDslPhysicsSpec,
  XyzDslIntentMode,
} from './types';

const SUPPORTED_OBJECT_PROPERTIES = new Set([
  ...SUPPORTED_MATERIAL_KEYS,
  ...SUPPORTED_PHYSICS_KEYS,
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
  'intent',
]);

export interface XyzDslObjectPropertiesSpec {
  material: XyzDslMaterialSpec;
  physics: XyzDslPhysicsSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  diagnostics: string[];
  intent?: XyzDslIntentMode;
}

export function parseObjectProperties(source: string): XyzDslObjectPropertiesSpec {
  const { declarations, diagnostics } = parsePropertyDeclarations(source);
  const material = parseMaterialDeclaration(declarations);
  const physics = parsePhysicsDeclaration(declarations);
  const geometry = parseGeometryDeclaration(declarations);
  const transform = parseTransformDeclaration(declarations);
  const reference = parseReferenceDeclaration(declarations);
  const content = parseContentDeclaration(declarations);
  const unsupportedDiagnostics = declarations
    .filter(({ property }) => !SUPPORTED_OBJECT_PROPERTIES.has(property))
    .map(
      ({ property }) => `Ignoring unsupported object property "${property}".`,
    );
  const intentValue = declarations.filter(({ property }) => property === 'intent').at(-1)?.value;
  const intent = intentValue === 'absolute' || intentValue === 'relative' ? intentValue : undefined;
  const intentDiagnostics = intentValue !== undefined && !intent
    ? [`Invalid intent "${intentValue}"; expected absolute or relative.`]
    : [];

  return {
    material,
    physics,
    geometry,
    transform,
    reference,
    content,
    intent,
    diagnostics: [
      ...diagnostics,
      ...material.diagnostics,
      ...physics.diagnostics,
      ...geometry.diagnostics,
      ...transform.diagnostics,
      ...reference.diagnostics,
      ...content.diagnostics,
      ...unsupportedDiagnostics,
      ...intentDiagnostics,
    ],
  };
}
