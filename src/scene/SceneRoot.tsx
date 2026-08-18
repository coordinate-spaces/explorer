import { useEffect, useMemo, useRef } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box3, Mesh, Quaternion, Vector3 } from 'three';
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
import { LocalCursorControls } from './LocalCursorControls';
import type { LocalCursorInput } from '../simulation/localCursor';
import { physicsEntityIdForNode } from '../physics/compilePhysicsScene';
import type { MountedSceneDiagnostic } from './mountedSceneDiagnostics';
import { boxTuple, matrixElements, mountedChildAnchorWorld, MOUNTED_GEOMETRY_PIVOT_TOLERANCE, quaternionTuple, vectorTuple } from './mountedSceneDiagnostics';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  secondaryCameraTarget?: SecondaryCameraTarget;
  localCursorControl?: {
    enabled: boolean;
    captured: boolean;
    onCaptureChange: (captured: boolean) => void;
    onInput: (input: LocalCursorInput) => void;
  };
  onMountedDiagnostics?: (diagnostics: readonly MountedSceneDiagnostic[]) => void;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [6, 5, 4];

function MountedSceneDiagnostics({ document, onPublish }: { document: SpatialDocument; onPublish?: (value: readonly MountedSceneDiagnostic[]) => void }) {
  const scene = useThree((state) => state.scene);
  const previous = useRef('');

  useFrame(() => {
    if (!onPublish) return;
    const meshes = new Map<string, Mesh[]>();
    scene.traverse((object) => {
      if (!(object instanceof Mesh) || typeof object.userData.fullStableNodeId !== 'string') return;
      const matches = meshes.get(object.userData.fullStableNodeId) ?? [];
      matches.push(object);
      meshes.set(object.userData.fullStableNodeId, matches);
    });
    const diagnostics = (document.physicsJoints ?? []).flatMap((joint): MountedSceneDiagnostic[] => {
      const articulation = joint.articulation;
      if (!articulation) return [];
      const candidates = meshes.get(joint.nodeId) ?? [];
      const nodeId = joint.nodeId;
      const base = { nodeId, physicsEntityId: articulation.childEntityId, meshCount: candidates.length };
      if (candidates.length !== 1) return [{ ...base, error: candidates.length ? 'multiple-mounted-meshes' : 'missing-mounted-mesh' }];
      const mesh = candidates[0];
      mesh.updateWorldMatrix(true, false);
      const top = new Vector3(0, 0.5, 0).applyMatrix4(mesh.matrixWorld);
      const position = mesh.getWorldPosition(new Vector3());
      const quaternion = mesh.getWorldQuaternion(new Quaternion());
      const scale = mesh.getWorldScale(new Vector3());
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
      const mountedAnchor = mountedChildAnchorWorld(mesh, joint.childAnchor);
      const parent = articulation.parentAnchorWorld ? new Vector3(...articulation.parentAnchorWorld) : undefined;
      const pivotError = parent && mountedAnchor ? parent.distanceTo(mountedAnchor) : undefined;
      const error = pivotError !== undefined && !Number.isFinite(pivotError) ? 'non-finite-mounted-geometry-pivot-error'
        : pivotError !== undefined && pivotError > MOUNTED_GEOMETRY_PIVOT_TOLERANCE ? 'mounted-geometry-pivot-error' : undefined;
      return [{ ...base, matrixWorld: matrixElements(mesh.matrixWorld), worldPosition: vectorTuple(position), worldQuaternion: quaternionTuple(quaternion), worldScale: vectorTuple(scale), topWorldPosition: vectorTuple(top), mountedAnchorWorld: mountedAnchor ? vectorTuple(mountedAnchor) : undefined, worldBoundingBox: bounds ? boxTuple(bounds) : undefined, parentAnchorWorld: articulation.parentAnchorWorld, pivotError, error }];
    });
    const serialized = JSON.stringify(diagnostics);
    if (serialized !== previous.current) { previous.current = serialized; onPublish(diagnostics); }
  });
  return null;
}

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
  localCursorControl,
  onMountedDiagnostics,
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
      {localCursorControl ? <LocalCursorControls
        enabled={localCursorControl.enabled}
        onCaptureChange={localCursorControl.onCaptureChange}
        onInput={localCursorControl.onInput}
      /> : null}
      {secondaryCameraNode && secondaryCameraTarget ? (
        <SecondaryCursorCamera
          node={secondaryCameraNode}
        />
      ) : null}
      <Lighting />
      <MountedSceneDiagnostics document={spatialDocument} onPublish={onMountedDiagnostics} />
      <XyzCoordinateSpace {...spatialDocument.coordinateSpace} />
      {spatialDocument.csgExpressions.map((expression) => (
        <CsgPrimitive
          key={expression.id}
          expression={expression}
          physicsEntityId={physicsEntityIdForNode(spatialDocument, expression.base)}
          isSelected={expression.base.id === selectedNodeId}
          onSelect={onSelectNode}
        />
      ))}
      {spatialDocument.renderNodes.map((node) => (
        node.content?.kind ? (
          <ContentPrimitive key={node.id} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        ) : (
          <SpatialPrimitive key={node.id} physicsEntityId={physicsEntityIdForNode(spatialDocument, node)} isSelected={node.id === selectedNodeId} node={node} onSelect={onSelectNode} />
        )
      ))}
      <OrbitControls enabled={!secondaryCameraNode && !localCursorControl?.captured} target={orbitTarget} maxPolarAngle={Math.PI} />
    </Canvas>
  );
}
