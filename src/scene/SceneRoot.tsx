import { useEffect, useMemo, useRef } from 'react';
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
import { SecondaryCameraMotionTracker, type SecondaryCameraTarget } from './secondaryCamera';

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

function SecondaryCursorCamera({ node, target }: { node: SpatialNode; target: SecondaryCameraTarget }) {
  const camera = useThree((state) => state.camera);
  const tracker = useRef(new SecondaryCameraMotionTracker());

  useEffect(() => () => {
    camera.position.set(14, 11, 18);
    camera.lookAt(...DEFAULT_ORBIT_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, delta) => {
    const center = node.transform.position;
    const motion = tracker.current.update(target, center);
    const heading = new Vector3(...motion.heading);
    const dimensions = node.geometry.dimensions;
    const clearance = Math.max(0.12, Math.min(0.6, Math.max(...dimensions) * 0.55));
    const desired = new Vector3(...center)
      .addScaledVector(heading, -clearance)
      .add(new Vector3(0, Math.min(clearance * 0.3, 0.2), 0));
    const smoothing = 1 - Math.exp(-10 * delta);

    if (motion.snap) camera.position.copy(desired);
    else camera.position.lerp(desired, smoothing);
    camera.lookAt(new Vector3(...center).add(heading));
    camera.updateProjectionMatrix();
  });

  return null;
}

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, secondaryCameraTarget }: SceneRootProps) {
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNodeId, spatialDocument]);
  const secondaryCameraNode = useMemo(() => secondaryCameraTarget
    ? spatialDocument.renderNodes.find((node) => node.origin?.sourceKind === 'secondary'
      && node.origin.streamId === secondaryCameraTarget.streamId
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
      {secondaryCameraNode && secondaryCameraTarget ? <SecondaryCursorCamera node={secondaryCameraNode} target={secondaryCameraTarget} /> : null}
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
