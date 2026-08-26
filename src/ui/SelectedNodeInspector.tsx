import { useEffect, useState } from 'react';
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
  isPovCamera: boolean;
  onPovCameraChange: (enabled: boolean) => void;
}

function metadataValue<T>(node: SpatialNode, key: string): T | undefined {
  return node.metadata?.[key] as T | undefined;
}

function displayName(node: SpatialNode): string {
  return node.namespacePath?.replace(/\/$/, '') || node.id;
}

const AXES: AxisName[] = ['x', 'y', 'z'];
const GEOMETRY_OPTIONS: XyzDslGeometryKind[] = ['box', 'cylinder', 'cone', 'sphere'];
const LINEAR_STEPS = [0.001, 0.01, 0.1, 1];

export function linearStepForNode(node: SpatialNode): number {
  const smallest = Math.min(node.box.width, node.box.height, node.box.depth);
  if (smallest <= 0.01) return 0.001;
  if (smallest <= 0.1) return 0.01;
  if (smallest <= 1) return 0.1;
  return 1;
}

export function rotationDegreesForInspector(rotationRadians: readonly number[]): number[] {
  return rotationRadians.map((value) => Number(((value * 180) / Math.PI).toFixed(3)));
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
  isPovCamera,
  onPovCameraChange,
}: SelectedNodeInspectorProps) {
  const [linearStep, setLinearStep] = useState(() => node ? linearStepForNode(node) : 0.01);
  const [rotationStep, setRotationStep] = useState(1);

  useEffect(() => {
    if (node) setLinearStep(linearStepForNode(node));
  }, [node?.id]);

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

      <label className="inspector-pov-toggle">
        <input type="checkbox" checked={isPovCamera} onChange={(event) => onPovCameraChange(event.target.checked)} />
        Use object perspective POV
      </label>

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
            value={linearStep}
            onChange={(event) => setLinearStep(Number(event.target.value))}
          >
            {LINEAR_STEPS.map((step) => <option key={step} value={step}>{step === 1 ? '1 m' : step === 0.1 ? '1 dm' : step === 0.01 ? '1 cm' : '1 mm'}</option>)}
          </select>
        </label>
        <label>
          Angle
          <select
            aria-label="Rotation step"
            value={rotationStep}
            onChange={(event) => setRotationStep(Number(event.target.value))}
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
                <output aria-label={`${transform.label} ${axis.toUpperCase()} value`}>{transform.label === 'Rotation' ? transform.values[index] : Number(transform.values[index].toFixed(3))}</output>
                <button type="button" disabled={!canEdit} aria-label={`Decrease ${transform.label.toLowerCase()} ${axis.toUpperCase()} by ${transform.step} ${transform.unit}`} onClick={() => transform.onStep(axis, -transform.step)}>−</button>
                <button type="button" disabled={!canEdit} aria-label={`Increase ${transform.label.toLowerCase()} ${axis.toUpperCase()} by ${transform.step} ${transform.unit}`} onClick={() => transform.onStep(axis, transform.step)}>+</button>
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
