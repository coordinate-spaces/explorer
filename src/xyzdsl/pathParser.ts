import { CENTIMETRES_PER_UNIT, DECIMETRES_PER_UNIT, MILLIMETRES_PER_UNIT } from '../model/units';
import type { AxisName, XyzDslAxisSpec, XyzDslBoxSpec, XyzDslPathSpec } from './types';

const AXES = ['x', 'y', 'z'] as const;
const PATH_NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:[dcm])?$/;
const LEADING_ZERO_PATTERN = /^0\d+(?:[dcm])?$/;
const AXIS_PATTERN = /^\+(?<offset>[^+]+)\+(?<size>[^+]+)$/;
const AXIS_NUMBER_CANDIDATE_PATTERN = /^\d+(?:[dcm])?$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+]*$/;

function isAxisSegment(segment: string): boolean {
  const match = segment.match(AXIS_PATTERN);

  return Boolean(
    match?.groups &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.offset) &&
      AXIS_NUMBER_CANDIDATE_PATTERN.test(match.groups.size),
  );
}

export function parsePathNumber(raw: string): number {
  if (LEADING_ZERO_PATTERN.test(raw)) {
    const suffix = /[dcm]$/.test(raw) ? raw.slice(-1) : '';
    const digits = suffix ? raw.slice(0, -1) : raw;
    throw new Error(`Leading-zero path numbers are no longer supported; use "${Number(digits)}${suffix}" instead of "${raw}".`);
  }

  if (!PATH_NUMBER_PATTERN.test(raw)) {
    throw new Error(`Expected a path number using unpadded digits with an optional metric-unit suffix (d, c, or m), received "${raw}".`);
  }

  const suffix = /[dcm]$/.test(raw) ? raw.slice(-1) : '';
  const value = Number(suffix ? raw.slice(0, -1) : raw);
  const scale = suffix === 'd' ? DECIMETRES_PER_UNIT : suffix === 'c' ? CENTIMETRES_PER_UNIT : suffix === 'm' ? MILLIMETRES_PER_UNIT : 1;
  return value / scale;
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
