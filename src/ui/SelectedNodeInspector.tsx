import { useEffect, useRef, useState } from 'react';
import type { AxisName, XyzDslGeometryKind } from '../xyzdsl/types';
import type { SpatialNode } from '../model/SpatialNode';
import { PressAndHoldButton } from './PressAndHoldButton';
import { linearTransformStepForNode } from '../model/transformStep';

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
  linearStepChoice: LinearStepChoice;
  rotationStep: RotationStep;
  onLinearStepChoiceChange: (choice: LinearStepChoice) => void;
  onRotationStepChange: (step: RotationStep) => void;
}

export type LinearStepChoice = 'auto' | 0.001 | 0.01 | 0.1 | 1 | 10;
export type RotationStep = 1 | 15;

function metadataValue<T>(node: SpatialNode, key: string): T | undefined {
  return node.metadata?.[key] as T | undefined;
}

function displayName(node: SpatialNode): string {
  return node.namespacePath?.replace(/\/$/, '') || node.id;
}

const AXES: AxisName[] = ['x', 'y', 'z'];
const GEOMETRY_OPTIONS: XyzDslGeometryKind[] = ['box', 'cylinder', 'cone', 'sphere'];

export function rotationDegreesForInspector(rotationRadians: readonly number[]): number[] {
  return rotationRadians.map((value) => Number(((value * 180) / Math.PI).toFixed(3)));
}

export function transformDeltaForDirectValue(currentValue: number, nextValue: string): number | undefined {
  if (nextValue.trim() === '') return undefined;
  const parsed = Number(nextValue);
  return Number.isFinite(parsed) ? parsed - currentValue : undefined;
}

function TransformValueInput({ label, value, step, disabled, onCommit }: {
  label: string;
  value: number;
  step: number;
  disabled: boolean;
  onCommit: (delta: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const cancelNextBlur = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commit = () => {
    if (cancelNextBlur.current) {
      cancelNextBlur.current = false;
      setEditing(false);
      setDraft(String(value));
      return;
    }
    const delta = transformDeltaForDirectValue(value, draft);
    setEditing(false);
    if (delta !== undefined && delta !== 0) onCommit(delta);
    else setDraft(String(value));
  };

  return <input
    aria-label={label}
    disabled={disabled}
    inputMode="decimal"
    step={step}
    type="number"
    value={draft}
    onBlur={commit}
    onChange={(event) => setDraft(event.target.value)}
    onFocus={() => setEditing(true)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        cancelNextBlur.current = true;
        setDraft(String(value));
        event.currentTarget.blur();
      }
    }}
  />;
}

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
  linearStepChoice,
  rotationStep,
  onLinearStepChoiceChange,
  onRotationStepChange,
}: SelectedNodeInspectorProps) {
  if (!node) {
    return (
      <section className="selected-node-inspector is-empty" aria-label="Object properties">
        <div className="inspector-empty-icon" aria-hidden="true">◇</div>
        <strong>No object selected</strong>
        <p>Select an object in the scene or outline to inspect its properties.</p>
      </section>
    );
  }

  const lineNumber = metadataValue<number>(node, 'lineNumber');
  const childNodes = node.children ?? [];
  const rotation = rotationDegreesForInspector(node.localTransform?.rotation ?? node.transform.rotation);
  const linearStep = linearStepChoice === 'auto' ? linearTransformStepForNode(node) : linearStepChoice;
  const transforms = [
    { label: 'Position', values: [node.box.x, node.box.y, node.box.z], step: linearStep, onStep: onMove, unit: 'units' },
    { label: 'Size', values: [node.box.width, node.box.height, node.box.depth], step: linearStep, onStep: onResize, unit: 'units' },
    { label: 'Rotation', values: rotation, step: rotationStep, onStep: onRotate, unit: 'degrees' },
  ];

  return (
    <section className="selected-node-inspector" aria-label="Object properties">
      <div className="section-heading-row inspector-heading">
        <div>
          <h2>Properties</h2>
          <p title={displayName(node)}>{displayName(node)}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Clear object selection" title="Clear selection" onClick={onClearSelection}>×</button>
      </div>

      <div className="inspector-facts">
        <span>{node.renderable ? (node.model?.source ? 'model' : node.geometry.kind) : 'group'}</span>
        <span>line {lineNumber ?? 'unknown'}</span>
        {!canEdit ? <span>read only</span> : null}
      </div>

      {selectionPath.length > 1 ? (
        <nav className="inspector-selection-path" aria-label="Selection hierarchy">
          <ol>
            {selectionPath.map((pathNode, index) => (
              <li key={pathNode.id}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <button type="button" aria-current={pathNode.id === node.id ? 'true' : undefined} onClick={() => onPathNodeSelect(pathNode.id)}>
                  {displayName(pathNode)}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {!canEdit ? <p className="inspector-warning">This declaration cannot be rewritten directly. Properties are shown for reference.</p> : null}

      <div className="inspector-section-heading">
        <strong>Transform</strong>
        <label>
          Step
          <select
            aria-label="Linear transform step"
            value={linearStepChoice}
            onChange={(event) => onLinearStepChoiceChange(event.target.value === 'auto' ? 'auto' : Number(event.target.value) as LinearStepChoice)}
          >
            <option value="auto">Auto ({linearStep} m)</option>
            <option value="0.001">1 mm</option>
            <option value="0.01">1 cm</option>
            <option value="0.1">1 dm</option>
            <option value="1">1 m</option>
            <option value="10">10 m</option>
          </select>
        </label>
        <label>
          Angle
          <select
            aria-label="Rotation step"
            value={rotationStep}
            onChange={(event) => onRotationStepChange(Number(event.target.value) as RotationStep)}
          >
            <option value="1">1°</option>
            <option value="15">15°</option>
          </select>
        </label>
      </div>

      <div className="inspector-transform-grid">
        {transforms.map((transform) => (
          <div className="inspector-transform-group" key={transform.label}>
            <strong>{transform.label}</strong>
            {AXES.map((axis, index) => (
              <div className="inspector-transform-row" key={axis}>
                <span className={`axis axis-${axis}`}>{axis.toUpperCase()}</span>
                <TransformValueInput
                  label={`${transform.label} ${axis.toUpperCase()} value`}
                  value={transform.values[index]}
                  step={transform.step}
                  disabled={!canEdit}
                  onCommit={(delta) => transform.onStep(axis, delta)}
                />
                <PressAndHoldButton disabled={!canEdit} aria-label={`Decrease ${transform.label.toLowerCase()} ${axis.toUpperCase()} by ${transform.step} ${transform.unit}`} onActivate={() => transform.onStep(axis, -transform.step)}>−</PressAndHoldButton>
                <PressAndHoldButton disabled={!canEdit} aria-label={`Increase ${transform.label.toLowerCase()} ${axis.toUpperCase()} by ${transform.step} ${transform.unit}`} onActivate={() => transform.onStep(axis, transform.step)}>+</PressAndHoldButton>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="inspector-section-heading"><strong>Appearance</strong></div>
      <div className="inspector-fields">
        {node.model?.source ? <label>Model<input disabled type="text" value={node.model.source} /></label> : null}
        <label>Geometry<select disabled={!canEdit} value={node.geometry.kind} onChange={(event) => onPropertyChange('geometry', event.target.value)}>{GEOMETRY_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label>Color<input disabled={!canEdit} type="text" value={String(node.material.color ?? '')} placeholder="blue or 0x3366ff" onChange={(event) => onPropertyChange('color', event.target.value)} /></label>
        <label>Roughness<input disabled={!canEdit} type="number" step="0.05" min="0" max="1" value={node.material.roughness ?? ''} onChange={(event) => onPropertyChange('roughness', event.target.value)} /></label>
        <label>Metalness<input disabled={!canEdit} type="number" step="0.05" min="0" max="1" value={node.material.metalness ?? ''} onChange={(event) => onPropertyChange('metalness', event.target.value)} /></label>
      </div>

      {childNodes.length > 0 ? (
        <section className="inspector-child-list" aria-label="Child selections">
          <strong>Children</strong>
          <ul>{childNodes.map((child) => <li key={child.id}><button type="button" onClick={() => onSelectNode(child.id)}>{displayName(child)}</button><span>{child.renderable ? child.geometry.kind : 'group'}</span></li>)}</ul>
        </section>
      ) : null}
    </section>
  );
}
