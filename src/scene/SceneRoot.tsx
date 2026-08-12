import { useEffect, useMemo } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { XyzCoordinateSpace } from './XyzCoordinateSpace';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';
import {
  secondaryCameraPose,
  type SecondaryCameraTarget,
} from './secondaryCamera';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  secondaryCameraTarget?: SecondaryCameraTarget;
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

function SecondaryCursorCamera({
  node,
}: {
  node: SpatialNode;
}) {
  const camera = useThree((state) => state.camera);

  useEffect(() => () => {
    camera.position.set(14, 11, 18);
    camera.lookAt(...DEFAULT_ORBIT_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame(() => {
    const pose = secondaryCameraPose(node.worldTransform ?? node.transform);
    camera.position.fromArray(pose.position);
    camera.lookAt(camera.position.clone().add(new Vector3(...pose.direction)));
    camera.updateProjectionMatrix();
  });

  return null;
}

export function SceneRoot({
  document: spatialDocument,
  selectedNodeId,
  onSelectNode,
  secondaryCameraTarget,
}: SceneRootProps) {
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNodeId, spatialDocument]);
  const secondaryCameraNode = useMemo(() => secondaryCameraTarget
    ? spatialDocument.renderNodes.find((node) => node.origin?.sourceKind === 'secondary'
      && (node.origin.streamId ?? node.origin.publicKey ?? 'secondary') === secondaryCameraTarget.streamId
      && (node.namespacePath ?? node.id) === secondaryCameraTarget.cursorNamespace)
    : undefined, [secondaryCameraTarget, spatialDocument]);
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
      <PerspectiveCamera makeDefault position={[14, 11, 18]} fov={45} near={0.02} />
      {secondaryCameraNode && secondaryCameraTarget ? (
        <SecondaryCursorCamera
          node={secondaryCameraNode}
        />
      ) : null}
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
      <OrbitControls enabled={!secondaryCameraNode} target={orbitTarget} maxPolarAngle={Math.PI} />
    </Canvas>
  );
}
