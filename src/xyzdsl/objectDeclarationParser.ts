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
  XyzDslIntentSpec,
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
  'intent-target', 'intent-command', 'intent-release',
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
  intentTarget?: XyzDslIntentSpec['target'];
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
  const targetValue = declarations.filter(({ property }) => property === 'intent-target').at(-1)?.value;
  const commandValue = declarations.filter(({ property }) => property === 'intent-command').at(-1)?.value;
  const releaseValue = declarations.filter(({ property }) => property === 'intent-release').at(-1)?.value;
  let intentTarget: XyzDslIntentSpec['target'];
  if (targetValue === undefined) intentTarget = undefined;
  else if (targetValue === 'body') intentTarget = { kind: 'body' };
  else if (targetValue.startsWith('body:') && targetValue.slice(5)) intentTarget = { kind: 'body', id: targetValue.slice(5) };
  else if (targetValue.startsWith('joint:') && targetValue.slice(6)) intentTarget = {
    kind: 'joint', id: targetValue.slice(6),
    ...(commandValue && ['position', 'velocity', 'effort'].includes(commandValue) ? { command: commandValue as 'position' | 'velocity' | 'effort' } : {}),
    ...(releaseValue && ['hold', 'brake', 'passive'].includes(releaseValue) ? { release: releaseValue as 'hold' | 'brake' | 'passive' } : {}),
  };
  else intentTarget = undefined;
  const targetDiagnostics = [
    ...(targetValue !== undefined && !intentTarget ? [`Invalid intent-target "${targetValue}"; expected body, body:<stable-id>, or joint:<stable-id>.`] : []),
    ...(commandValue !== undefined && !['position', 'velocity', 'effort'].includes(commandValue) ? [`Invalid intent-command "${commandValue}"; expected position, velocity, or effort.`] : []),
    ...(releaseValue !== undefined && !['hold', 'brake', 'passive'].includes(releaseValue) ? [`Invalid intent-release "${releaseValue}"; expected hold, brake, or passive.`] : []),
  ];

  return {
    material,
    physics,
    geometry,
    transform,
    reference,
    content,
    intent,
    intentTarget,
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
      ...targetDiagnostics,
    ],
  };
}
