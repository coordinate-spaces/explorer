import { parsePathNumber } from './pathParser';
import { parseXyzDslDeclaration } from './parser';
import type { AxisName } from './types';

const DECLARATION_PATTERN = /^(?<indent>\s*)"(?<path>[^"]+)"(?<middle>\s*:\s*)"(?<properties>[^"]*)"(?<suffix>\s*)$/;
const AXIS_PATTERN = /^\+(?<offset>\d+(?:[dcm])?)\+(?<size>\d+(?:[dcm])?)$/;
const MILLIMETRES_PER_UNIT = 1000;
const MIN_SIZE = 0.001;
const ROTATION_PRECISION = 1000;

interface DeclarationParts {
  indent: string;
  path: string;
  middle: string;
  properties: string;
  suffix: string;
}

interface AxisParts {
  offset: number;
  size: number;
}

function splitLines(source: string): string[] {
  return source.split('\n');
}

function declarationParts(line: string): DeclarationParts | undefined {
  const match = line.match(DECLARATION_PATTERN);

  if (!match?.groups) {
    return undefined;
  }

  return {
    indent: match.groups.indent,
    path: match.groups.path,
    middle: match.groups.middle,
    properties: match.groups.properties,
    suffix: match.groups.suffix,
  };
}

function replaceLine(source: string, lineNumber: number, replacement: string): string {
  const lines = splitLines(source);
  const index = lineNumber - 1;

  if (index < 0 || index >= lines.length) {
    return source;
  }

  lines[index] = replacement;
  return lines.join('\n');
}

function formatDeclaration(parts: DeclarationParts): string {
  return `${parts.indent}"${parts.path}"${parts.middle}"${parts.properties}"${parts.suffix}`;
}

function formatPathNumber(value: number): string {
  const millimetres = Math.max(0, Math.round(value * MILLIMETRES_PER_UNIT));

  if (millimetres % 1000 === 0) {
    return String(millimetres / 1000);
  }
  if (millimetres % 100 === 0) return `${millimetres / 100}d`;
  if (millimetres % 10 === 0) return `${millimetres / 10}c`;
  return `${millimetres}m`;
}

function parseAxis(segment: string): AxisParts | undefined {
  const match = segment.match(AXIS_PATTERN);

  if (!match?.groups) {
    return undefined;
  }

  const offset = parsePathNumber(match.groups.offset);
  const size = parsePathNumber(match.groups.size);

  return { offset, size };
}

function formatAxis(axis: AxisParts): string {
  return `+${formatPathNumber(axis.offset)}+${formatPathNumber(Math.max(MIN_SIZE, axis.size))}`;
}

function updatePathAxes(path: string, updater: (axis: AxisName, value: AxisParts) => AxisParts): string {
  const segments = path.split('/');
  const axisStart = segments.findIndex((segment) => AXIS_PATTERN.test(segment));

  if (axisStart < 0 || segments.length - axisStart !== 3) {
    return path;
  }

  const axes: AxisName[] = ['x', 'y', 'z'];
  const nextSegments = [...segments];

  axes.forEach((axis, axisIndex) => {
    const segmentIndex = axisStart + axisIndex;
    const parsed = parseAxis(segments[segmentIndex]);

    if (!parsed) {
      return;
    }

    nextSegments[segmentIndex] = formatAxis(updater(axis, parsed));
  });

  return nextSegments.join('/');
}

function parseProperties(properties: string): Array<{ key: string; value: string }> {
  return properties
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(':');

      if (separatorIndex === -1) {
        return { key: part, value: '' };
      }

      return {
        key: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1).trim(),
      };
    });
}

function formatProperties(properties: Array<{ key: string; value: string }>): string {
  return properties.map(({ key, value }) => `${key}: ${value}`).join('; ');
}

function formatRotationDegrees(value: number): string {
  const rounded = Math.round(value * ROTATION_PRECISION) / ROTATION_PRECISION;

  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseRotationDegrees(value: string): [number, number, number] {
  const parts = value.split(',').map((part) => Number(part.trim()));

  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function replaceDeclarationPath(source: string, lineNumber: number, nextPath: string): string {
  const lines = splitLines(source);
  const line = lines[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  return replaceLine(source, lineNumber, formatDeclaration({ ...parts, path: nextPath }));
}

export function replaceDeclarationProperties(source: string, lineNumber: number, nextProperties: string): string {
  const lines = splitLines(source);
  const line = lines[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  return replaceLine(source, lineNumber, formatDeclaration({ ...parts, properties: nextProperties }));
}

export function updateDeclarationProperty(source: string, lineNumber: number, key: string, value: string): string {
  const lines = splitLines(source);
  const line = lines[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  const properties = parseProperties(parts.properties);
  const existing = properties.find((property) => property.key === key);

  if (existing) {
    existing.value = value;
  } else {
    properties.push({ key, value });
  }

  return replaceDeclarationProperties(source, lineNumber, formatProperties(properties));
}

export function moveDeclarationPath(source: string, lineNumber: number, axis: AxisName, delta: number): string {
  const line = splitLines(source)[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  return replaceDeclarationPath(
    source,
    lineNumber,
    updatePathAxes(parts.path, (currentAxis, value) =>
      currentAxis === axis ? { ...value, offset: Math.max(0, value.offset + delta) } : value,
    ),
  );
}

export function resizeDeclarationPath(source: string, lineNumber: number, axis: AxisName, delta: number): string {
  const line = splitLines(source)[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  return replaceDeclarationPath(
    source,
    lineNumber,
    updatePathAxes(parts.path, (currentAxis, value) =>
      currentAxis === axis ? { ...value, size: Math.max(MIN_SIZE, value.size + delta) } : value,
    ),
  );
}

export function rotateDeclarationPath(
  source: string,
  lineNumber: number,
  axis: AxisName,
  deltaDegrees: number,
  inheritedRotationDegrees: [number, number, number] = [0, 0, 0],
): string {
  const line = splitLines(source)[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);

  if (!parts) {
    return source;
  }

  const axisIndex = ['x', 'y', 'z'].indexOf(axis);
  const properties = parseProperties(parts.properties);
  const existing = properties.find((property) => property.key === 'rotation' || property.key === 'rotate');
  const rotation: [number, number, number] = existing ? parseRotationDegrees(existing.value) : [...inheritedRotationDegrees];
  rotation[axisIndex] += deltaDegrees;
  const nextValue = rotation.map(formatRotationDegrees).join(', ');

  return updateDeclarationProperty(source, lineNumber, existing?.key ?? 'rotation', nextValue);
}

export function lineNumberForNodeSource(source: string, nodeSource: string): number | undefined {
  const index = splitLines(source).findIndex((line) => line === nodeSource);

  return index === -1 ? undefined : index + 1;
}

export function canEditDeclarationLine(source: string, lineNumber: number): boolean {
  const line = splitLines(source)[lineNumber - 1];

  if (!line || !declarationParts(line)) {
    return false;
  }

  return parseXyzDslDeclaration(line, lineNumber).ok;
}

export interface DeclarationPose {
  /** Rendered local center, not the path's lower-edge offset. */
  position: [number, number, number];
  /** Local XYZ Euler rotation in radians. */
  rotation: [number, number, number];
}

/** Atomically writes a cursor pose while retaining the declaration's path namespaces and property key choice. */
export function applyDeclarationPose(source: string, lineNumber: number, pose: DeclarationPose): string {
  const line = splitLines(source)[lineNumber - 1];
  const parts = line === undefined ? undefined : declarationParts(line);
  if (!parts || !parseXyzDslDeclaration(line, lineNumber).ok) return source;

  const segments = parts.path.split('/');
  const axisStart = segments.findIndex((segment) => AXIS_PATTERN.test(segment));
  if (axisStart < 0 || segments.length - axisStart !== 3) return source;
  const axes = segments.slice(axisStart).map(parseAxis);
  if (axes.some((axis) => !axis)) return source;
  const nextSegments = [...segments];
  axes.forEach((axis, index) => {
    const value = axis as AxisParts;
    nextSegments[axisStart + index] = formatAxis({ ...value, offset: Math.max(0, pose.position[index] - value.size / 2) });
  });

  const properties = parseProperties(parts.properties);
  const rotation = properties.find((property) => property.key === 'rotation' || property.key === 'rotate');
  const value = pose.rotation.map((radian) => formatRotationDegrees(radian * 180 / Math.PI)).join(', ');
  if (rotation) rotation.value = value;
  else properties.push({ key: 'rotation', value });
  return replaceLine(source, lineNumber, formatDeclaration({ ...parts, path: nextSegments.join('/'), properties: formatProperties(properties) }));
}
