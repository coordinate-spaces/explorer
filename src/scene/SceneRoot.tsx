import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import { dimensionsFromNodes } from '../model/room';
import { XyzCornerGrid } from './XyzCornerGrid';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';
import { ModelPrimitive } from './ModelPrimitive';
import { nodesForRoomSizing } from './roomSizing';
import { cameraClipPlanes, cameraSceneScale } from './cameraScale';
import { inspectionPose } from './cameraPlacement';
import { PovControls } from './PovControls';
import { Vector3, type PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { cameraNodeForSelection } from './cameraSelection';
import { CameraClipController } from './CameraClipController';
import { povCollisionRadius } from './povNavigation';
import { EditorSelectionControls } from './EditorSelectionControls';
import type { AxisName } from '../xyzdsl/types';

export type CameraMode = 'orbit' | 'pov';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  editorMode: boolean;
  selectedNodeCanEdit: boolean;
  onMoveNode: (axis: AxisName, delta: number) => void;
  onResizeNode: (axis: AxisName, delta: number) => void;
  onRotateNode: (axis: AxisName, delta: number) => void;
  onCreateNode: (position: [number, number, number]) => void;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [0.6, 0.5, 0.4];
const DEFAULT_CAMERA_POSITION: [number, number, number] = [1.4, 1.1, 1.8];

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, cameraMode, onCameraModeChange, editorMode, selectedNodeCanEdit, onMoveNode, onResizeNode, onRotateNode, onCreateNode }: SceneRootProps) {
  const cameraSizingNodes = useMemo(() => nodesForRoomSizing(spatialDocument), [spatialDocument]);
  const roomDimensions = dimensionsFromNodes(cameraSizingNodes);
  const [modelPrecisionScales, setModelPrecisionScales] = useState<Record<string, number>>({});
  const handleModelPrecisionScaleChange = useCallback((id: string, scale: number | undefined) => {
    setModelPrecisionScales((current) => {
      if (scale === undefined) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === scale) return current;
      return { ...current, [id]: scale };
    });
  }, []);
  const selectedNode = useMemo(
    () => {
      const node = cameraNodeForSelection(spatialDocument, selectedNodeId);
      const precisionScale = node && modelPrecisionScales[node.id];
      return node && precisionScale ? {
        ...node,
        metadata: { ...node.metadata, cameraPrecisionScale: precisionScale },
      } : node;
    },
    [modelPrecisionScales, selectedNodeId, spatialDocument],
  );
  const sceneScale = cameraSceneScale(cameraSizingNodes, selectedNode, DEFAULT_CAMERA_POSITION);
  const clips = cameraClipPlanes(sceneScale, cameraSizingNodes, DEFAULT_CAMERA_POSITION);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [collision, setCollision] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const orbitTarget = useMemo(() => {
    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNode]);

  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const handledFocusRequest = useRef(0);
  useEffect(() => {
    if (!selectedNode || !cameraRef.current || focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    const forward = cameraRef.current.getWorldDirection(new Vector3()).toArray() as [number, number, number];
    const pose = inspectionPose(selectedNode, forward);
    cameraRef.current.position.set(...pose.position);
    cameraRef.current.lookAt(...pose.target);
  }, [focusRequest, selectedNode]);
  useEffect(() => {
    if (!cameraRef.current || resetRequest === 0) return;
    cameraRef.current.position.set(...DEFAULT_CAMERA_POSITION);
    cameraRef.current.lookAt(...DEFAULT_ORBIT_TARGET);
  }, [resetRequest]);

  return (
    <div className="scene-viewport">
    <Canvas
      className="scene-canvas"
      shadows
      gl={{ antialias: true }}
      onPointerMissed={() => {
        if (cameraMode === 'orbit') onSelectNode?.(undefined);
      }}
    >
      <color attach="background" args={['#151820']} />
      <PerspectiveCamera ref={cameraRef} makeDefault position={DEFAULT_CAMERA_POSITION} fov={45} near={clips.near} far={clips.far} />
      <Lighting />
      <XyzCornerGrid {...roomDimensions} />
      {spatialDocument.csgExpressions.map((expression) => (
        <CsgPrimitive
          key={expression.id}
          expression={expression}
          isSelected={expression.base.id === selectedNodeId}
          onSelect={onSelectNode}
          selectionEnabled={cameraMode === 'orbit'}
        />
      ))}
      {spatialDocument.renderNodes.map((node) => (
        node.model?.source ? (
          <ModelPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} onPrecisionScaleChange={handleModelPrecisionScaleChange} />
        ) : node.content?.kind ? (
          <ContentPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} />
        ) : (
          <SpatialPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} />
        )
      ))}
      {cameraMode === 'orbit' ? <OrbitControls target={orbitTarget} maxPolarAngle={Math.PI} /> : null}
      <PovControls
        active={cameraMode === 'pov'}
        collision={collision}
        collisionRadius={povCollisionRadius(sceneScale)}
        speed={sceneScale * 1.5 * speedMultiplier}
        onLockChange={setPointerLocked}
        onSelectNode={onSelectNode}
      />
      <CameraClipController nodes={cameraSizingNodes} scale={sceneScale} />
      <EditorSelectionControls
        active={editorMode && cameraMode === 'orbit'}
        canEditSelection={Boolean(selectedNodeId && selectedNodeCanEdit)}
        linearStep={selectedNode ? Math.max(0.001, 10 ** Math.floor(Math.log10(Math.min(...selectedNode.transform.scale.filter((value) => value > 0))) - 1)) : 0.01}
        rotationStep={1}
        onMove={onMoveNode}
        onResize={onResizeNode}
        onRotate={onRotateNode}
        onCreate={onCreateNode}
      />
    </Canvas>
    <section className={`camera-controls camera-controls--${cameraMode}`} aria-label="Camera navigation">
      <div className="camera-mode-switch" role="group" aria-label="Camera mode">
        <button type="button" aria-pressed={cameraMode === 'orbit'} onClick={() => onCameraModeChange('orbit')}>Orbit</button>
        <button type="button" aria-pressed={cameraMode === 'pov'} onClick={() => onCameraModeChange('pov')}>POV</button>
      </div>
      {cameraMode === 'pov' ? <>
        <p>{pointerLocked ? 'WASD move · E/Q up/down · Z precision · Shift boost · Esc release' : 'Click the viewport to look around'}</p>
        <label>Speed <input aria-label="POV movement speed" type="range" min="0.1" max="4" step="0.1" value={speedMultiplier} onChange={(event) => setSpeedMultiplier(Number(event.target.value))} /> <span>{(sceneScale * 1.5 * speedMultiplier).toPrecision(2)} u/s</span></label>
        <button className="camera-option" type="button" aria-pressed={collision} onClick={() => setCollision((value) => !value)}>{collision ? 'Collision on' : 'No clip'}</button>
        <button className="camera-option" type="button" disabled={!selectedNode} onClick={() => setFocusRequest((value) => value + 1)}>Focus selection</button>
        <button className="camera-option" type="button" onClick={() => setResetRequest((value) => value + 1)}>Reset camera</button>
      </> : null}
    </section>
    {cameraMode === 'pov' && pointerLocked ? <div className="pov-crosshair" aria-hidden="true">+</div> : null}
    </div>
  );
}
