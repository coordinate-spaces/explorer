import { useCallback, useState } from 'react';
import { DEFAULT_SPATIAL_CURSOR, normalizeSpatialCursor, type SpatialCursorDraft } from './spatialCursor';

const STORAGE_KEY = 'xyzdsl-spatial-cursor-v1';

function initialCursor(): SpatialCursorDraft {
  if (typeof window === 'undefined') return DEFAULT_SPATIAL_CURSOR;
  try {
    return normalizeSpatialCursor(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_SPATIAL_CURSOR;
  }
}

export function usePersistentSpatialCursor() {
  const [cursor, setCursorState] = useState(initialCursor);
  const setCursor: typeof setCursorState = useCallback((next) => {
    setCursorState((previous) => {
      const resolved = next instanceof Function ? next(previous) : next;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      return resolved;
    });
  }, []);
  return [cursor, setCursor] as const;
}
