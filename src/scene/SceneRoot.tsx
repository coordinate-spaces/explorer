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
import {
  constrainPointOutsideBounds,
  forwardBoundsExit,
  SecondaryCameraMotionTracker,
  type SecondaryCameraSample,
  type SecondaryCameraTarget,
} from './secondaryCamera';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  secondaryCameraTarget?: SecondaryCameraTarget;
  secondaryCameraDiscontinuity?: number;
  secondaryCameraHistorySamples?: readonly SecondaryCameraSample[];
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
  target,
  tracker,
  discontinuity,
}: {
  node: SpatialNode;
  target: SecondaryCameraTarget;
  tracker: SecondaryCameraMotionTracker;
  discontinuity: number;
}) {
  const camera = useThree((state) => state.camera);
  const firstFrame = useRef(true);
  const previousDiscontinuity = useRef(discontinuity);
  const previousMotionDiscontinuity = useRef(tracker.snapshot(target).discontinuity);

  useEffect(() => () => {
    camera.position.set(14, 11, 18);
    camera.lookAt(...DEFAULT_ORBIT_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, delta) => {
    const motion = tracker.snapshot(target);
    const heading = new Vector3(...motion.heading);
    const dimensions = node.geometry.dimensions;
    const clearance = Math.max(0.12, Math.min(0.6, Math.max(...dimensions) * 0.55));
    const forwardMargin = Math.max(0.02, Math.min(0.1, Math.max(...dimensions) * 0.05));
    const surfacePosition = new Vector3(...forwardBoundsExit(node.bounds, motion.heading, forwardMargin));
    const biasedPosition = surfacePosition.clone().add(new Vector3(0, Math.min(clearance * 0.3, 0.2), 0));
    const desired = biasedPosition.x >= node.bounds.minX && biasedPosition.x <= node.bounds.maxX
      && biasedPosition.y >= node.bounds.minY && biasedPosition.y <= node.bounds.maxY
      && biasedPosition.z >= node.bounds.minZ && biasedPosition.z <= node.bounds.maxZ
      ? surfacePosition
      : biasedPosition;
    const smoothing = 1 - Math.exp(-10 * delta);

    const mustSnap = firstFrame.current
      || previousDiscontinuity.current !== discontinuity
      || previousMotionDiscontinuity.current !== motion.discontinuity;
    if (mustSnap) camera.position.copy(desired);
    else {
      camera.position.lerp(desired, smoothing);
      camera.position.fromArray(constrainPointOutsideBounds(
        camera.position.toArray(),
        node.bounds,
        desired.toArray(),
      ));
    }
    camera.lookAt(camera.position.clone().add(heading));
    camera.updateProjectionMatrix();
    firstFrame.current = false;
    previousDiscontinuity.current = discontinuity;
    previousMotionDiscontinuity.current = motion.discontinuity;
  });

  return null;
}

export function SceneRoot({
  document: spatialDocument,
  selectedNodeId,
  onSelectNode,
  secondaryCameraTarget,
  secondaryCameraDiscontinuity = 0,
  secondaryCameraHistorySamples = [],
}: SceneRootProps) {
  const secondaryCameraTracker = useRef(new SecondaryCameraMotionTracker());
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNodeId, spatialDocument]);
  const secondaryCameraNode = useMemo(() => secondaryCameraTarget
    ? spatialDocument.renderNodes.find((node) => node.origin?.sourceKind === 'secondary'
      && (node.origin.streamId ?? node.origin.publicKey ?? 'secondary') === secondaryCameraTarget.streamId
      && (node.namespacePath ?? node.id) === secondaryCameraTarget.cursorNamespace)
    : undefined, [secondaryCameraTarget, spatialDocument]);
  useEffect(() => {
    secondaryCameraHistorySamples.forEach(({ target, position }) => {
      secondaryCameraTracker.current.update(target, position);
    });
    spatialDocument.renderNodes.forEach((node) => {
      if (node.origin?.sourceKind !== 'secondary') return;
      secondaryCameraTracker.current.update({
        streamId: node.origin.streamId ?? node.origin.publicKey ?? 'secondary',
        cursorNamespace: node.namespacePath ?? node.id,
      }, node.unwrappedTransform?.position ?? node.transform.position);
    });
  }, [secondaryCameraHistorySamples, spatialDocument]);

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
          target={secondaryCameraTarget}
          tracker={secondaryCameraTracker.current}
          discontinuity={secondaryCameraDiscontinuity}
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
