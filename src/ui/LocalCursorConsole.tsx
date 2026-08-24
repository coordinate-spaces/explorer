import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { SPATIAL_UNITS } from '../model/units';
import type { LocalCursorState } from '../scene/localCursor';
import { cursorCoordinatePath } from '../scene/localCursor';
import { parseXyzDslPath } from '../xyzdsl/pathParser';
import type { XyzDslGeometryKind } from '../xyzdsl/types';

export interface CursorPreviewSettings {
  name: string;
  size: [number, number, number];
  geometry: XyzDslGeometryKind;
  color: string;
  roughness: number;
  metalness: number;
}

interface Props {
  cursor: LocalCursorState;
  settings: CursorPreviewSettings;
  onCursorChange: (cursor: LocalCursorState) => void;
  onSettingsChange: (settings: CursorPreviewSettings) => void;
  onCommit: () => void;
}

export function LocalCursorConsole({ cursor, settings, onCursorChange, onSettingsChange, onCommit }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | undefined>(undefined);
  let nameError = '';
  if (settings.name.trim()) {
    try { parseXyzDslPath(`${settings.name.trim()}/`); } catch (error) { nameError = error instanceof Error ? error.message : 'Invalid name.'; }
  }
  const update = <K extends keyof CursorPreviewSettings>(key: K, value: CursorPreviewSettings[K]) => onSettingsChange({ ...settings, [key]: value });
  const startDrag = (event: ReactPointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    const x = Math.max(-window.innerWidth + 240, Math.min(window.innerWidth - 240, drag.current.ox + event.clientX - drag.current.x));
    const y = Math.max(-20, Math.min(window.innerHeight - 100, drag.current.oy + event.clientY - drag.current.y));
    setOffset({ x, y });
  };

  return <section className="local-cursor-console" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} aria-label="Local cursor settings">
    <header className="cursor-console-title" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = undefined; }}>
      <span><strong>Local cursor</strong><small>WASD · Q/E vertical</small></span>
      <button type="button" aria-expanded={!collapsed} onPointerDown={(event) => event.stopPropagation()} onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'Expand' : 'Collapse'}</button>
    </header>
    {!collapsed ? <div className="cursor-console-body">
      <output className="cursor-coordinate-output" aria-label="XYZDSL cursor coordinates">{cursorCoordinatePath(cursor.position, settings.size)}</output>
      <dl className="cursor-axis-values">{(['X', 'Y', 'Z'] as const).map((axis, index) => <div key={axis}><dt>{axis}</dt><dd>{cursor.position[index].toFixed(3)} m</dd></div>)}</dl>
      <div className="cursor-console-row">
        <label>Unit<select value={cursor.unit} onChange={(event) => onCursorChange({ ...cursor, unit: event.target.value as LocalCursorState['unit'] })}>{Object.entries(SPATIAL_UNITS).map(([unit, detail]) => <option value={unit} key={unit}>{detail.label} ({unit})</option>)}</select></label>
        <button type="button" aria-pressed={cursor.mouseLook} onClick={() => onCursorChange({ ...cursor, mouseLook: !cursor.mouseLook })}>{cursor.mouseLook ? 'Stop mouse look' : 'Mouse look'}</button>
        <button type="button" aria-pressed={cursor.pov} onClick={() => onCursorChange({ ...cursor, pov: !cursor.pov })}>{cursor.pov ? 'Exit POV' : 'POV camera'}</button>
      </div>
      <label>Name (optional)<input value={settings.name} placeholder="Room/Probe" onChange={(event) => update('name', event.target.value)} />{nameError ? <small className="cursor-error">{nameError}</small> : null}</label>
      <div className="cursor-dimensions">{(['width', 'height', 'depth'] as const).map((label, index) => <label key={label}>{label}<input type="number" min="0.001" step="0.001" value={settings.size[index]} onChange={(event) => { const size = [...settings.size] as [number, number, number]; size[index] = Math.max(0.001, Number(event.target.value)); update('size', size); }} /></label>)}</div>
      <div className="cursor-console-row"><label>Geometry<select value={settings.geometry} onChange={(event) => update('geometry', event.target.value as XyzDslGeometryKind)}>{['box', 'cylinder', 'cone', 'sphere'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Color<input value={settings.color} onChange={(event) => update('color', event.target.value)} /></label></div>
      <div className="cursor-console-row"><label>Roughness<input type="number" min="0" max="1" step="0.05" value={settings.roughness} onChange={(event) => update('roughness', Number(event.target.value))} /></label><label>Metalness<input type="number" min="0" max="1" step="0.05" value={settings.metalness} onChange={(event) => update('metalness', Number(event.target.value))} /></label></div>
      <button className="cursor-add-button" type="button" disabled={Boolean(nameError)} onClick={onCommit}>Add declaration</button>
    </div> : null}
  </section>;
}
