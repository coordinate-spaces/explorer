import { useState } from 'react';
import type { AxisName, XyzDslGeometryKind } from '../xyzdsl/types';
import type { SpatialNode } from '../model/SpatialNode';

interface SelectedNodeInspectorProps {
  node?: SpatialNode;
  canEdit: boolean;
  selectionPath?: SpatialNode[];
  onClearSelection: () => void;
  onMove: (axis: AxisName, delta: number) => void;
  onResize: (axis: AxisName, delta: number) => void;
  onRotate: (axis: AxisName, deltaDegrees: number) => void;
  onPathNodeSelect: (id: string) => void;
  onPropertyChange: (key: string, value: string) => void;
  onSelectNode: (id: string) => void;
}

function metadataValue<T>(node: SpatialNode, key: string): T | undefined {
  return node.metadata?.[key] as T | undefined;
}

function displayName(node: SpatialNode): string {
  return node.namespacePath?.replace(/\/$/, '') || node.id;
}

const GEOMETRY_OPTIONS: XyzDslGeometryKind[] = ['box', 'cylinder', 'cone', 'sphere'];

const ROTATION_AXIS_DESCRIPTIONS: Record<AxisName, string> = {
  x: 'Rotates around the left-right X axis, pitching the object forward or backward.',
  y: 'Rotates around the vertical Y axis, yawing the object left or right.',
  z: 'Rotates around the depth Z axis, rolling the object clockwise or counterclockwise.',
};

export function SelectedNodeInspector({
  node,
  canEdit,
  selectionPath = [],
  onClearSelection,
  onMove,
  onResize,
  onRotate,
  onPathNodeSelect,
  onPropertyChange,
  onSelectNode,
}: SelectedNodeInspectorProps) {
  const [translationStep, setTranslationStep] = useState<1 | 0.01>(1);

  if (!node) {
    return null;
  }

  const lineNumber = metadataValue<number>(node, 'lineNumber');
  const rotationStep = translationStep === 1 ? 15 : 1;
  const childNodes = node.children ?? [];


  return (
    <section className="selected-node-inspector" aria-label="Selected scene object editor">
      <div
        className="section-heading-row"
      >
        <div>
          <h2>Object selection</h2>
          <p>{displayName(node)}</p>
        </div>
        <button type="button" onClick={onClearSelection}>
          Clear
        </button>
      </div>

      <dl>
        <div>
          <dt>Declaration line</dt>
          <dd>{lineNumber ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Bounds</dt>
          <dd>
            {node.box.width} × {node.box.height} × {node.box.depth} at ({node.box.x}, {node.box.y}, {node.box.z})
          </dd>
        </div>
        {node.origin ? <div>
          <dt>Source</dt>
          <dd>{node.origin.sourceKind}{node.origin.streamId ? ` · ${node.origin.streamId}` : ''}</dd>
        </div> : null}
        {(node.activeInteractions?.length ?? 0) > 0 ? <div>
          <dt>Interactions</dt>
          <dd>{node.activeInteractions!.map((fact) => `${fact.state} by ${fact.cursorNamespace} (${fact.streamId})`).join(', ')}</dd>
        </div> : null}
        {node.baseBox && (node.baseBox.x !== node.box.x || node.baseBox.y !== node.box.y || node.baseBox.z !== node.box.z) ? <div>
          <dt>Base position</dt>
          <dd>({node.baseBox.x}, {node.baseBox.y}, {node.baseBox.z})</dd>
        </div> : null}
      </dl>

      {selectionPath.length > 1 ? (
        <nav className="inspector-selection-path" aria-label="Selection hierarchy">
          <strong>Hierarchy</strong>
          <ol>
            {selectionPath.map((pathNode) => (
              <li key={pathNode.id}>
                <button
                  type="button"
                  aria-current={pathNode.id === node.id ? 'true' : undefined}
                  onClick={() => onPathNodeSelect(pathNode.id)}
                >
                  {displayName(pathNode)}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {childNodes.length > 0 ? (
        <section className="inspector-child-list" aria-label="Child selections">
          <strong>Child elements</strong>
          <ul>
            {childNodes.map((child) => (
              <li key={child.id}>
                <button type="button" onClick={() => onSelectNode(child.id)}>
                  {displayName(child)}
                </button>
                <span>
                  {child.renderable ? child.geometry.kind : 'group'}
                  {child.geometry.operation ? ` · ${child.geometry.operation}` : ''}
                  {child.csgConsumed ? ' · csg tool' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!canEdit ? <p className="inspector-warning">This selection cannot be rewritten as a single editable spatial declaration.</p> : null}

      <details className="inspector-section" open>
        <summary>
          <strong>Transform</strong>
          <label onClick={(event) => event.stopPropagation()}>
            Step
            <select value={translationStep} onChange={(event) => setTranslationStep(Number(event.target.value) as 1 | 0.01)}>
              <option value="1">1 unit</option>
              <option value="0.01">1 centiunit</option>
            </select>
          </label>
        </summary>
        {([
          ['Move', onMove, translationStep],
          ['Resize', onResize, translationStep],
          ['Rotate', onRotate, rotationStep],
        ] as const).map(([label, handler, step]) => (
          <div className="inspector-transform-row" key={label}>
            <strong>{label}</strong>
            {(['x', 'y', 'z'] as AxisName[]).map((axis) => (
              <span key={`${label}-${axis}`} className="inspector-axis-stepper">
                <span title={label === 'Rotate' ? ROTATION_AXIS_DESCRIPTIONS[axis] : undefined}>{axis.toUpperCase()}</span>
                <button type="button" disabled={!canEdit} aria-label={`${label} ${axis.toUpperCase()} backward by ${step}`} onClick={() => handler(axis, -step)}>−</button>
                <button type="button" disabled={!canEdit} aria-label={`${label} ${axis.toUpperCase()} forward by ${step}`} onClick={() => handler(axis, step)}>+</button>
              </span>
            ))}
          </div>
        ))}
      </details>

      <details className="inspector-section" open>
        <summary><strong>Appearance</strong></summary>
      <div className="inspector-fields">
        <label>
          Geometry
          <select disabled={!canEdit} value={node.geometry.kind} onChange={(event) => onPropertyChange('geometry', event.target.value)}>
            {GEOMETRY_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          Color
          <input
            disabled={!canEdit}
            type="text"
            value={String(node.material.color ?? '')}
            placeholder="blue or 0x3366ff"
            onChange={(event) => onPropertyChange('color', event.target.value)}
          />
        </label>
        <label>
          Roughness
          <input
            disabled={!canEdit}
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={node.material.roughness ?? ''}
            onChange={(event) => onPropertyChange('roughness', event.target.value)}
          />
        </label>
        <label>
          Metalness
          <input
            disabled={!canEdit}
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={node.material.metalness ?? ''}
            onChange={(event) => onPropertyChange('metalness', event.target.value)}
          />
        </label>
      </div>
      </details>
    </section>
  );
}
