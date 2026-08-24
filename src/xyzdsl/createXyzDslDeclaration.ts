import { parseXyzDslPath } from './pathParser';
import type { SpatialCursorDraft } from '../cursor/spatialCursor';

const MILLIMETRES_PER_UNIT = 1000;

export function formatXyzDslPathNumber(value: number): string {
  const millimetres = Math.max(0, Math.round(value * MILLIMETRES_PER_UNIT));
  if (millimetres % 1000 === 0) return String(millimetres / 1000);
  if (millimetres % 100 === 0) return `${millimetres / 100}d`;
  if (millimetres % 10 === 0) return `${millimetres / 10}c`;
  return `${millimetres}m`;
}

export function spatialCursorNamespaceError(cursor: SpatialCursorDraft): string | undefined {
  if (!cursor.named) return undefined;
  try {
    parseXyzDslPath(`${cursor.namespace}/+0+1/+0+1/+0+1`);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid namespace.';
  }
}

export function createXyzDslDeclaration(cursor: SpatialCursorDraft): string {
  const axes = cursor.position.map((offset, index) =>
    `+${formatXyzDslPathNumber(offset)}+${formatXyzDslPathNumber(cursor.dimensions[index])}`,
  );
  const prefix = cursor.named ? `${cursor.namespace}/` : '';
  const degrees = cursor.rotation.map((value) => Math.round((value * 180 / Math.PI) * 1000) / 1000);
  const properties = [
    `geometry: ${cursor.geometry}`,
    `color: ${cursor.color}`,
    `metalness: ${cursor.metalness}`,
    `roughness: ${cursor.roughness}`,
    ...(cursor.geometry === 'box' && cursor.boxRadius > 0 ? [`box-radius: ${cursor.boxRadius}`] : []),
    ...(cursor.geometry === 'box' && cursor.puff > 0 ? [`puff: ${cursor.puff}`] : []),
    ...(degrees.some((value) => value !== 0) ? [`rotation: ${degrees.join(', ')}`] : []),
  ];
  return `"${prefix}${axes.join('/')}" : "${properties.join('; ')}"`;
}
