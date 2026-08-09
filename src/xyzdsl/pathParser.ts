import { CENTIUNITS_PER_UNIT } from '../model/units';
import type { AxisName, XyzDslAxisSpec, XyzDslBoxSpec, XyzDslConditionalSpec, XyzDslPathSpec } from './types';

const AXES = ['x', 'y', 'z'] as const;
const PATH_NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:c)?$/;
const LEGACY_LEADING_ZERO_PATTERN = /^0\d+(?:c)?$/;
const LEGACY_P_DECIMAL_PATTERN = /^(?<whole>\d+)p(?<fraction>\d+)$/;
const AXIS_PATTERN = /^\+(?<offset>[^+]+)\+(?<size>[^+]+)$/;
const AXIS_NUMBER_CANDIDATE_PATTERN = /^(?:\d+(?:c)?|\d+p\d+)$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+]*$/;
const DIRECTIVE_PATTERN = /^\+(?<name>[A-Za-z][A-Za-z0-9]*)$/;
const DELTA_PATTERN = /^\+(?<magnitude>(?:0|[1-9]\d*)(?:c)?)$/;
const WEIGHTED_TRANSLATION_SEGMENT = '+++';
const SUPPORTED_INTERACTION_DIRECTIVES = new Set(['probe', 'breach', 'contact']);

function isAxisSegment(segment: string): boolean {
  const match = segment.match(AXIS_PATTERN);

  return Boolean(
    match?.groups &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.offset) &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.size),
  );
}

function centiunitMigration(raw: string): string | undefined {
  const match = raw.match(LEGACY_P_DECIMAL_PATTERN);

  if (!match?.groups) {
    return undefined;
  }

  const whole = Number(match.groups.whole);
  const fraction = match.groups.fraction.replace(/0+$/, '');

  if (fraction.length === 0) {
    return String(whole);
  }

  if (fraction.length > 2) {
    return undefined;
  }

  const centiunits = whole * CENTIUNITS_PER_UNIT + Number(fraction.padEnd(2, '0'));

  return `${centiunits}c`;
}

export function parsePathNumber(raw: string): number {
  const pDecimalMigration = centiunitMigration(raw);

  if (pDecimalMigration) {
    throw new Error(`p-decimal path numbers are no longer supported; use "${pDecimalMigration}" instead of "${raw}".`);
  }

  if (LEGACY_P_DECIMAL_PATTERN.test(raw)) {
    throw new Error(`p-decimal path numbers are no longer supported and "${raw}" cannot be represented exactly as centiunits.`);
  }

  if (LEGACY_LEADING_ZERO_PATTERN.test(raw)) {
    const suffix = raw.endsWith('c') ? 'c' : '';
    const digits = suffix ? raw.slice(0, -1) : raw;
    throw new Error(`Leading-zero path numbers are no longer supported; use "${Number(digits)}${suffix}" instead of "${raw}".`);
  }

  if (!PATH_NUMBER_PATTERN.test(raw)) {
    throw new Error(`Expected a path number using digits with an optional centiunit suffix, received "${raw}".`);
  }

  if (raw.endsWith('c')) {
    return Number(raw.slice(0, -1)) / CENTIUNITS_PER_UNIT;
  }

  return Number(raw);
}

export function parsePathAxisSpec(raw: string, axis: AxisName): XyzDslAxisSpec {
  const match = raw.match(AXIS_PATTERN);

  if (!match?.groups) {
    throw new Error(`Axis ${axis.toUpperCase()} must use +offset+size syntax.`);
  }

  const offset = parsePathNumber(match.groups.offset);
  const size = parsePathNumber(match.groups.size);

  if (size <= 0) {
    throw new Error(`Axis ${axis.toUpperCase()} size must be greater than zero.`);
  }

  return { axis, offset, size };
}

function parseBoxSegments(segments: readonly string[], source: string): XyzDslBoxSpec {
  const [xAxis, yAxis, zAxis] = segments.map((segment, index) => parsePathAxisSpec(segment, AXES[index]));

  return {
    source,
    x: xAxis.offset,
    y: yAxis.offset,
    z: zAxis.offset,
    width: xAxis.size,
    height: yAxis.size,
    depth: zAxis.size,
  };
}

export function parsePathBoxSpec(source: string): XyzDslBoxSpec {
  const segments = source.split('/');

  if (segments.length !== 3) {
    throw new Error('Box spec must contain X/Y/Z axis segments separated by / characters.');
  }

  return parseBoxSegments(segments, source);
}

export function normalizeNamespacePath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function canonicalNamespacePath(namespace: string[]): string {
  return namespace.length > 0 ? `${namespace.join('/')}/` : '';
}

export function parseXyzDslPath(source: string): XyzDslPathSpec {
  const trimmed = source.trim();

  if (!trimmed) {
    throw new Error('Declaration path cannot be empty.');
  }

  const declarationOnly = trimmed.endsWith('/');
  const rawSegments = trimmed.split('/');
  const segments = rawSegments.filter((segment, index) => !(declarationOnly && index === rawSegments.length - 1));

  if (segments.some((segment) => segment.trim() !== segment || segment.length === 0)) {
    throw new Error('Path segments cannot be empty or contain leading/trailing whitespace.');
  }

  const directiveEntries = segments.flatMap((segment, segmentIndex) => {
    const match = segment.match(DIRECTIVE_PATTERN);
    return match?.groups ? [{ name: match.groups.name, segmentIndex }] : [];
  });

  if (directiveEntries.length > 0) {
    directiveEntries.forEach(({ name }) => {
      if (!SUPPORTED_INTERACTION_DIRECTIVES.has(name)) {
        throw new Error(`Unknown interaction directive "+${name}". Expected +probe, +breach, or +contact.`);
      }
    });

    let suffixStart = segments.length;
    let spatialOverride: XyzDslConditionalSpec['spatialOverride'] = { mode: 'inherit' };
    const suffix = segments.slice(-3);

    if (segments.at(-1) === WEIGHTED_TRANSLATION_SEGMENT) {
      suffixStart = segments.length - 1;
      spatialOverride = { mode: 'weighted-translation' };
    } else if (suffix.length === 3 && suffix.every(isAxisSegment)) {
      suffixStart = segments.length - 3;
      const boxSource = suffix.join('/');
      spatialOverride = { mode: 'absolute-box', box: parsePathBoxSpec(boxSource) };
    } else if (suffix.length === 3 && suffix.every((segment) => DELTA_PATTERN.test(segment))) {
      suffixStart = segments.length - 3;
      spatialOverride = {
        mode: 'translation',
        magnitude: suffix.map((segment) => parsePathNumber(segment.slice(1))) as [number, number, number],
      };
    }

    const pathSegments = segments.slice(0, suffixStart);
    const namespace: string[] = [];
    const directives = pathSegments.flatMap((segment, segmentIndex) => {
      const match = segment.match(DIRECTIVE_PATTERN);
      if (!match?.groups) {
        namespace.push(segment);
        return [];
      }
      return [{
        name: match.groups.name as 'probe' | 'breach' | 'contact',
        segmentIndex,
        scopeNamespace: [...namespace],
      }];
    });

    validateNamespaceSegments(namespace);
    if (namespace.length === 0 || directives.some((directive) => directive.scopeNamespace.length === 0)) {
      throw new Error('Interaction directives require a target namespace and a namespace scope before the directive.');
    }
    if (pathSegments.some((segment) => isAxisSegment(segment) || DELTA_PATTERN.test(segment))) {
      throw new Error('Conditional paths must end with either three XYZ axes or three translation magnitudes.');
    }

    const conditional = { directives, spatialOverride, targetNamespace: namespace };
    return {
      source,
      namespace,
      ...(spatialOverride.mode === 'absolute-box' ? { box: spatialOverride.box } : {}),
      canonicalPath: `${canonicalNamespacePath(namespace)}${directives.map((directive) => `+${directive.name}`).join('/')}`,
      isDeclarationOnly: false,
      conditional,
    };
  }

  if (declarationOnly) {
    if (segments.length === 0) {
      throw new Error('Namespace declaration must include at least one namespace segment.');
    }

    const axisIndex = segments.findIndex(isAxisSegment);
    if (axisIndex !== -1) {
      throw new Error('Declaration-only namespaces cannot include coordinate axis segments.');
    }

    validateNamespaceSegments(segments);

    return {
      source,
      namespace: segments,
      canonicalPath: canonicalNamespacePath(segments),
      isDeclarationOnly: true,
    };
  }

  const axisStart = segments.findIndex(isAxisSegment);

  if (axisStart === -1) {
    validateNamespaceSegments(segments);

    return {
      source,
      namespace: segments,
      canonicalPath: canonicalNamespacePath(segments),
      isDeclarationOnly: true,
    };
  }

  const namespace = segments.slice(0, axisStart);
  const axisSegments = segments.slice(axisStart);

  validateNamespaceSegments(namespace);

  if (axisSegments.length !== 3 || !axisSegments.every(isAxisSegment)) {
    throw new Error('Namespaced instance paths must end with exactly X/Y/Z axis segments.');
  }

  const boxSource = axisSegments.join('/');

  return {
    source,
    namespace,
    box: parsePathBoxSpec(boxSource),
    canonicalPath: namespace.length > 0 ? `${namespace.join('/')}/${boxSource}` : boxSource,
    isDeclarationOnly: false,
  };
}

function validateNamespaceSegments(segments: string[]): void {
  const invalid = segments.find((segment) => !NAMESPACE_PATTERN.test(segment));

  if (invalid) {
    throw new Error(`Namespace segment "${invalid}" must start with a letter or number and contain only Base64 characters except the / delimiter.`);
  }
}
