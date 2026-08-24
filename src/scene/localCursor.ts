import type { SpatialUnit } from '../model/units';
import { SPATIAL_UNITS } from '../model/units';
import { formatPathNumber } from '../xyzdsl/editXyzDslSource';

export interface LocalCursorState {
  position: [number, number, number];
  rotation: [number, number, number];
  unit: SpatialUnit;
  mouseLook: boolean;
  pov: boolean;
}

export const INITIAL_LOCAL_CURSOR: LocalCursorState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  unit: 'cm',
  mouseLook: false,
  pov: false,
};

export function moveLocalCursor(cursor: LocalCursorState, delta: [number, number, number]): LocalCursorState {
  const step = SPATIAL_UNITS[cursor.unit].metres;
  return {
    ...cursor,
    position: cursor.position.map((value, index) => Math.max(0, value + delta[index] * step)) as [number, number, number],
  };
}

export function cursorCoordinatePath(position: readonly number[], size: readonly number[] = [0.1, 0.1, 0.1]): string {
  return position.map((value, index) => `+${formatPathNumber(value)}+${formatPathNumber(size[index])}`).join('/');
}
