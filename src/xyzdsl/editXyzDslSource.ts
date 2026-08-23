import { CENTIMETERS_PER_UNIT, MILLIMETERS_PER_UNIT } from '../model/units';
import { parseXyzDslDeclaration } from './parser';
import type { AxisName } from './types';

const DECLARATION_PATTERN = /^(?<indent>\s*)"(?<path>[^"]+)"(?<middle>\s*:\s*)"(?<properties>[^"]*)"(?<suffix>\s*)$/;
const AXIS_PATTERN = /^\+(?<offset>\d+(?:c|m)?)\+(?<size>\d+(?:c|m)?)$/;
const MIN_SIZE = 0.01;
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
  const millimeters = Math.max(0, Math.round(value * MILLIMETERS_PER_UNIT));

  if (millimeters % MILLIMETERS_PER_UNIT === 0) {
    return String(millimeters / MILLIMETERS_PER_UNIT);
  }

  if (millimeters % 10 === 0) {
    return `${millimeters / 10}c`;
  }

  return `${millimeters}m`;
}

function parseAxisNumber(raw: string): number {
  if (raw.endsWith('c')) {
    return Number(raw.slice(0, -1)) / CENTIMETERS_PER_UNIT;
  }

  if (raw.endsWith('m')) {
    return Number(raw.slice(0, -1)) / MILLIMETERS_PER_UNIT;
  }

  return Number(raw);
}

function parseAxis(segment: string): AxisParts | undefined {
  const match = segment.match(AXIS_PATTERN);

  if (!match?.groups) {
    return undefined;
  }

  return { offset: parseAxisNumber(match.groups.offset), size: parseAxisNumber(match.groups.size) };
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
