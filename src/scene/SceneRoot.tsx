import { useMemo } from 'react';
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
import { LocalSpatialCursor } from './LocalSpatialCursor';
import type { LocalCursorState } from './localCursor';
import type { XyzDslGeometryKind } from '../xyzdsl/types';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  cursor: LocalCursorState;
  cursorSize: [number, number, number];
  cursorColor: string;
  cursorGeometry: XyzDslGeometryKind;
  onCursorPositionChange: (position: [number, number, number]) => void;
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

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, cursor, cursorSize, cursorColor, cursorGeometry, onCursorPositionChange }: SceneRootProps) {
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
      <PerspectiveCamera makeDefault position={[1.4, 1.1, 1.8]} fov={45} near={0.001} />
      <Lighting />
      <CornerRoom {...roomDimensions} />
      <LocalSpatialCursor cursor={cursor} size={cursorSize} color={cursorColor} geometry={cursorGeometry} onPositionChange={onCursorPositionChange} />
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
      <OrbitControls enabled={!cursor.mouseLook && !cursor.pov} target={orbitTarget} maxPolarAngle={Math.PI} />
    </Canvas>
  );
}
