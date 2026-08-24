import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_SPATIAL_CURSOR, type SpatialCursorDraft } from '../cursor/spatialCursor';
import { spatialCursorNamespaceError } from '../xyzdsl/createXyzDslDeclaration';
import type { XyzDslGeometryKind } from '../xyzdsl/types';

interface SpatialCursorConsoleProps {
  cursor: SpatialCursorDraft;
  setCursor: Dispatch<SetStateAction<SpatialCursorDraft>>;
  onInsert: () => void;
  onReplace: () => void;
  onLoadSelected: () => void;
  canReplace: boolean;
  hasSelection: boolean;
}

const geometries: XyzDslGeometryKind[] = ['box', 'cylinder', 'cone', 'sphere'];

export function SpatialCursorConsole({ cursor, setCursor, onInsert, onReplace, onLoadSelected, canReplace, hasSelection }: SpatialCursorConsoleProps) {
  const namespaceError = spatialCursorNamespaceError(cursor);
  const patch = (next: Partial<SpatialCursorDraft>) => setCursor((current) => ({ ...current, ...next }));
  const setDimension = (index: number, value: number) => {
    const dimensions = [...cursor.dimensions] as [number, number, number];
    dimensions[index] = Math.max(0.001, value);
    patch({ dimensions });
  };
  return (
    <section className="spatial-cursor-console" aria-label="Spatial cursor settings">
      <header><strong>Spatial cursor</strong><button type="button" aria-pressed={cursor.enabled} onClick={() => patch({ enabled: !cursor.enabled })}>{cursor.enabled ? 'Active' : 'Paused'}</button></header>
      <p className="cursor-help">WASD moves horizontally · Q/E moves vertically · right-click captures mouse rotation · Shift is fine control.</p>
      <div className="cursor-readout"><span>XYZ {cursor.position.map((v) => v.toFixed(3)).join(' / ')}</span><span>° {cursor.rotation.map((v) => Math.round(v * 180 / Math.PI)).join(' / ')}</span></div>
      <div className="cursor-fields">
        <label><input type="checkbox" checked={cursor.previewVisible} onChange={(event) => patch({ previewVisible: event.target.checked })} /> Preview</label>
        <label><input type="checkbox" checked={cursor.named} onChange={(event) => patch({ named: event.target.checked })} /> Named</label>
        {cursor.named ? <label>Name<input value={cursor.namespace} onChange={(event) => patch({ namespace: event.target.value })} aria-invalid={Boolean(namespaceError)} /></label> : null}
        {namespaceError ? <small className="cursor-error">{namespaceError}</small> : null}
        <fieldset><legend>Dimensions</legend>{cursor.dimensions.map((value, index) => <input key={index} aria-label={`${['Width', 'Height', 'Depth'][index]}`} type="number" min="0.001" step="0.01" value={value} onChange={(event) => setDimension(index, Number(event.target.value))} />)}</fieldset>
        <label>Geometry<select value={cursor.geometry} onChange={(event) => patch({ geometry: event.target.value as XyzDslGeometryKind })}>{geometries.map((geometry) => <option key={geometry}>{geometry}</option>)}</select></label>
        <label>Color<input value={cursor.color} onChange={(event) => patch({ color: event.target.value })} /></label>
        <label>Metalness<input type="number" min="0" max="1" step="0.05" value={cursor.metalness} onChange={(event) => patch({ metalness: Number(event.target.value) })} /></label>
        <label>Roughness<input type="number" min="0" max="1" step="0.05" value={cursor.roughness} onChange={(event) => patch({ roughness: Number(event.target.value) })} /></label>
        {cursor.geometry === 'box' ? <><label>Box radius<input type="number" min="0" step="0.01" value={cursor.boxRadius} onChange={(event) => patch({ boxRadius: Number(event.target.value) })} /></label><label>Puff<input type="number" min="0" max="5" step="1" value={cursor.puff} onChange={(event) => patch({ puff: Number(event.target.value) })} /></label></> : null}
        <label>Speed<input type="number" min="0.01" step="0.05" value={cursor.movementSpeed} onChange={(event) => patch({ movementSpeed: Number(event.target.value) })} /></label>
        <label>Space<select value={cursor.coordinateSpace} onChange={(event) => patch({ coordinateSpace: event.target.value as 'world' | 'local' })}><option value="world">World</option><option value="local">Local</option></select></label>
      </div>
      <div className="cursor-actions"><button type="button" disabled={Boolean(namespaceError)} onClick={onInsert}>Insert</button><button type="button" disabled={!canReplace || Boolean(namespaceError)} onClick={onReplace}>Replace selected</button><button type="button" disabled={!hasSelection} onClick={onLoadSelected}>Load selected</button><button type="button" onClick={() => setCursor(DEFAULT_SPATIAL_CURSOR)}>Reset</button></div>
    </section>
  );
}
