import type { XyzDslGeometryKind } from '../xyzdsl/types';

export type CursorCoordinateSpace = 'world' | 'local';

export interface SpatialCursorDraft {
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: [number, number, number];
  named: boolean;
  namespace: string;
  geometry: XyzDslGeometryKind;
  color: string;
  metalness: number;
  roughness: number;
  boxRadius: number;
  puff: number;
  movementSpeed: number;
  mouseSensitivity: number;
  coordinateSpace: CursorCoordinateSpace;
  invertMouseY: boolean;
  enabled: boolean;
  previewVisible: boolean;
}

export const DEFAULT_SPATIAL_CURSOR: SpatialCursorDraft = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: [0.2, 0.2, 0.2],
  named: false,
  namespace: 'Object',
  geometry: 'box',
  color: '#38bdf8',
  metalness: 0,
  roughness: 0.7,
  boxRadius: 0,
  puff: 0,
  movementSpeed: 0.25,
  mouseSensitivity: 0.0025,
  coordinateSpace: 'world',
  invertMouseY: false,
  enabled: true,
  previewVisible: true,
};

export function normalizeSpatialCursor(value: unknown): SpatialCursorDraft {
  if (!value || typeof value !== 'object') return DEFAULT_SPATIAL_CURSOR;
  const candidate = value as Partial<SpatialCursorDraft>;
  return { ...DEFAULT_SPATIAL_CURSOR, ...candidate };
}
