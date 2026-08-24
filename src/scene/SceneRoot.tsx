import { useMemo, useState } from 'react';
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
import type { CursorPose } from './useSpatialCursorControls';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  cursorPose?: CursorPose;
  cursorEnabled?: boolean;
  onCursorPreview?: (pose: CursorPose) => void;
  onCursorCommit?: (pose: CursorPose) => void;
  onCursorCancel?: () => void;
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

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, cursorPose, cursorEnabled = false, onCursorPreview, onCursorCommit, onCursorCancel }: SceneRootProps) {
  const [cursorMouseCaptured, setCursorMouseCaptured] = useState(false);
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
      onPointerMissed={() => {
        onSelectNode?.(undefined);
      }}
    >
      <color attach="background" args={['#151820']} />
      <PerspectiveCamera makeDefault position={[1.4, 1.1, 1.8]} fov={45} />
      <Lighting />
      <CornerRoom {...roomDimensions} />
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
      {cursorPose && onCursorPreview && onCursorCommit && onCursorCancel ? <SpatialCursor pose={cursorPose} enabled={cursorEnabled} onPreview={onCursorPreview} onCommit={onCursorCommit} onCancel={onCursorCancel} onMouseCaptureChange={setCursorMouseCaptured} /> : null}
      <OrbitControls target={orbitTarget} maxPolarAngle={Math.PI} enabled={!cursorMouseCaptured} />
    </Canvas>
  );
}
