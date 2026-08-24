import { useEffect, useMemo, useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { dimensionsFromNodes } from '../model/room';
import { CornerRoom } from './CornerRoom';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';
import { nodesForRoomSizing } from './roomSizing';
import { SpatialCursor } from './SpatialCursor';
import type { SpatialCursorDraft } from '../cursor/spatialCursor';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  cursor: SpatialCursorDraft;
  onCursorChange: (cursor: SpatialCursorDraft) => void;
  onCursorCaptureChange?: (captured: boolean) => void;
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

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, cursor, onCursorChange, onCursorCaptureChange }: SceneRootProps) {
  const [cursorCaptured, setCursorCaptured] = useState(false);
  useEffect(() => {
    const updateCapture = () => {
      const captured = document.pointerLockElement !== null;
      setCursorCaptured(captured);
      onCursorCaptureChange?.(captured);
    };
    document.addEventListener('pointerlockchange', updateCapture);
    return () => document.removeEventListener('pointerlockchange', updateCapture);
  }, [onCursorCaptureChange]);
  const roomDimensions = dimensionsFromNodes(nodesForRoomSizing(spatialDocument));
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNodeId, spatialDocument]);

  return (
    <Canvas
      className="scene-canvas"
      shadows
      gl={{ antialias: true }}
      onContextMenu={(event) => event.nativeEvent.preventDefault()}
      onPointerDown={(event) => {
        if (event.button === 2 && cursor.enabled) {
          event.nativeEvent.preventDefault();
          event.currentTarget.requestPointerLock();
        }
      }}
      onPointerMissed={() => {
        onSelectNode?.(undefined);
      }}
    >
      <color attach="background" args={['#151820']} />
      <PerspectiveCamera makeDefault position={[1.4, 1.1, 1.8]} fov={45} />
      <Lighting />
      <CornerRoom {...roomDimensions} />
      <SpatialCursor cursor={cursor} onChange={onCursorChange} />
      {spatialDocument.csgExpressions.map((expression) => (
        <CsgPrimitive
          key={expression.id}
          expression={expression}
          isSelected={expression.base.id === selectedNodeId}
          onSelect={onSelectNode}
        />
      ))}
      {spatialDocument.renderNodes.map((node) => (
        node.content?.kind ? (
          <ContentPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        ) : (
          <SpatialPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        )
      ))}
      <OrbitControls target={orbitTarget} maxPolarAngle={Math.PI} enableRotate={!cursorCaptured} />
    </Canvas>
  );
}
