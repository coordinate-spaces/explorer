import { useMemo } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { XyzCoordinateSpace } from './XyzCoordinateSpace';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [6, 5, 4];

function selectedOrbitNode(spatialDocument: SpatialDocument, selectedNodeId?: string): SpatialNode | undefined {
  if (!selectedNodeId) {
    return undefined;
  }

  return (
    spatialDocument.renderNodes.find((node) => node.id === selectedNodeId) ??
    spatialDocument.csgExpressions.find((expression) => expression.base.id === selectedNodeId)?.base
  );
}

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode }: SceneRootProps) {
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
      <PerspectiveCamera makeDefault position={[14, 11, 18]} fov={45} />
      <Lighting />
      <XyzCoordinateSpace {...spatialDocument.coordinateSpace} />
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
      <OrbitControls target={orbitTarget} maxPolarAngle={Math.PI} />
    </Canvas>
  );
}
