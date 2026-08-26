import { useEffect, useMemo } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { dimensionsFromNodes } from '../model/room';
import { XyzCornerGrid } from './XyzCornerGrid';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';
import { ModelPrimitive } from './ModelPrimitive';
import { nodesForRoomSizing } from './roomSizing';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  appMode: 'viewer' | 'editor';
  canEditSelection: boolean;
  movementStep: number;
  onMoveSelected: (axis: 'x' | 'y' | 'z', delta: number) => void;
  onRotateSelected: (axis: 'x' | 'y' | 'z', delta: number) => void;
  onCreateProspective: (position: [number, number, number]) => void;
  povCameraNodeId?: string;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [0.6, 0.5, 0.4];

function selectedOrbitNode(spatialDocument: SpatialDocument, selectedNodeId?: string): SpatialNode | undefined {
  if (!selectedNodeId) {
    return undefined;
  }

  return (
    spatialDocument.renderNodes.find((node) => node.id === selectedNodeId) ??
    spatialDocument.csgExpressions.find((expression) => expression.base.id === selectedNodeId)?.base
  );
}

export function SceneRoot({
  document: spatialDocument,
  selectedNodeId,
  onSelectNode,
  appMode,
  canEditSelection,
  movementStep,
  onMoveSelected,
  onRotateSelected,
  onCreateProspective,
  povCameraNodeId,
}: SceneRootProps) {
  const roomDimensions = dimensionsFromNodes(nodesForRoomSizing(spatialDocument));
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNodeId, spatialDocument]);
  const povNode = selectedOrbitNode(spatialDocument, povCameraNodeId);
  const editorInteractionEnabled = appMode === 'editor' && canEditSelection;

  useEffect(() => {
    if (!editorInteractionEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      const movement: Record<string, ['x' | 'z', number]> = {
        w: ['z', -movementStep],
        s: ['z', movementStep],
        a: ['x', -movementStep],
        d: ['x', movementStep],
      };
      const command = movement[event.key.toLowerCase()];
      if (!command) return;
      event.preventDefault();
      onMoveSelected(...command);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorInteractionEnabled, movementStep, onMoveSelected]);

  const handleBackgroundDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (appMode === 'editor') onCreateProspective([event.point.x, 0, event.point.z]);
  };

  const handleTouchpadRotation = (event: ThreeEvent<WheelEvent>) => {
    if (!editorInteractionEnabled) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    onRotateSelected('y', -event.deltaX * 0.15);
    onRotateSelected('x', -event.deltaY * 0.15);
  };

  return (
    <Canvas
      className="scene-canvas"
      shadows
      gl={{ antialias: true }}
      onPointerMissed={() => {
        onSelectNode?.(undefined);
      }}
    >
      <color attach="background" args={['#151820']} />
      {povNode && appMode === 'editor' ? (
        <PerspectiveCamera makeDefault position={povNode.transform.position} rotation={povNode.transform.rotation} fov={60} near={0.0005} />
      ) : <PerspectiveCamera makeDefault position={[1.4, 1.1, 1.8]} fov={45} />}
      <Lighting />
      <XyzCornerGrid {...roomDimensions} />
      {appMode === 'editor' ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.001, 0]}
          onClick={() => onSelectNode?.(undefined)}
          onDoubleClick={handleBackgroundDoubleClick}
          onWheel={handleTouchpadRotation}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      {spatialDocument.csgExpressions.map((expression) => (
        <CsgPrimitive
          key={expression.id}
          expression={expression}
          isSelected={expression.base.id === selectedNodeId}
          onSelect={onSelectNode}
        />
      ))}
      {spatialDocument.renderNodes.map((node) => (
        node.model?.source ? (
          <ModelPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        ) : node.content?.kind ? (
          <ContentPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        ) : (
          <SpatialPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        )
      ))}
      {!povNode || appMode !== 'editor' ? <OrbitControls target={orbitTarget} maxPolarAngle={Math.PI} /> : null}
    </Canvas>
  );
}
