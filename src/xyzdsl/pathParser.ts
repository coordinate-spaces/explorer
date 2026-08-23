import { CENTIMETERS_PER_UNIT, MILLIMETERS_PER_UNIT } from '../model/units';
import type { AxisName, XyzDslAxisSpec, XyzDslBoxSpec, XyzDslPathSpec } from './types';

const AXES = ['x', 'y', 'z'] as const;
const PATH_NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:c|m)?$/;
const LEGACY_LEADING_ZERO_PATTERN = /^0\d+(?:c|m)?$/;
const LEGACY_P_DECIMAL_PATTERN = /^(?<whole>\d+)p(?<fraction>\d+)$/;
const AXIS_PATTERN = /^\+(?<offset>[^+]+)\+(?<size>[^+]+)$/;
const AXIS_NUMBER_CANDIDATE_PATTERN = /^(?:\d+(?:c|m)?|\d+p\d+)$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+]*$/;

function isAxisSegment(segment: string): boolean {
  const match = segment.match(AXIS_PATTERN);

  return Boolean(
    match?.groups &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.offset) &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.size),
  );
}

function metricSuffixMigration(raw: string): string | undefined {
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

  const millimeters = whole * MILLIMETERS_PER_UNIT + Number(fraction.padEnd(2, '0'));

  return millimeters % 10 === 0 ? `${millimeters / 10}c` : `${millimeters}m`;
}

export function parsePathNumber(raw: string): number {
  const pDecimalMigration = metricSuffixMigration(raw);

  if (pDecimalMigration) {
    throw new Error(`p-decimal path numbers are no longer supported; use "${pDecimalMigration}" instead of "${raw}".`);
  }

  if (LEGACY_P_DECIMAL_PATTERN.test(raw)) {
    throw new Error(`p-decimal path numbers are no longer supported and "${raw}" cannot be represented exactly in centimeters or millimeters.`);
  }

  if (LEGACY_LEADING_ZERO_PATTERN.test(raw)) {
    const suffix = raw.endsWith('c') || raw.endsWith('m') ? raw.slice(-1) : '';
    const digits = suffix ? raw.slice(0, -1) : raw;
    throw new Error(`Leading-zero path numbers are no longer supported; use "${Number(digits)}${suffix}" instead of "${raw}".`);
  }

  if (!PATH_NUMBER_PATTERN.test(raw)) {
    throw new Error(`Expected a path number using digits with an optional centimeter (c) or millimeter (m) suffix, received "${raw}".`);
  }

  if (raw.endsWith('c')) {
    return Number(raw.slice(0, -1)) / CENTIMETERS_PER_UNIT;
  }

  if (raw.endsWith('m')) {
    return Number(raw.slice(0, -1)) / MILLIMETERS_PER_UNIT;
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
