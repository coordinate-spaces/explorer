import { useEffect, useMemo, useRef } from 'react';
import { Html, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box3, Box3Helper, BufferGeometry, Line, LineBasicMaterial, Mesh, Object3D, Quaternion, Vector3 } from 'three';
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
import { boxTuple, matrixElements, mountedChildAnchorWorld, mountedChildAxisWorld, MOUNTED_GEOMETRY_PIVOT_TOLERANCE, quaternionTuple, vectorTuple } from './mountedSceneDiagnostics';

export interface SceneRootProps {
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
  /** Draw live, world-space markers for installed articulation constraints. */
  articulationDebugOverlay?: boolean;
  /** Include the mounted child mesh's world-space bounds in the articulation overlay. */
  articulationDebugBoundingBox?: boolean;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [6, 5, 4];
const DEBUG_AXIS_LENGTH = 0.8;

function findMountedMesh(scene: Object3D, nodeId: string): Mesh | undefined {
  let result: Mesh | undefined;
  scene.traverse((object) => {
    if (!result && object instanceof Mesh && object.userData.fullStableNodeId === nodeId) result = object;
  });
  return result;
}

function ArticulationDebugJoint({ joint, showBoundingBox }: {
  joint: NonNullable<SpatialDocument['physicsJoints']>[number];
  showBoundingBox: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const parentMarker = useRef<Mesh>(null);
  const helperGroup = useRef<Object3D>(null);
  const childMarker = useRef<Mesh>(null);
  const parentLabel = useRef<Object3D>(null);
  const childLabel = useRef<Object3D>(null);
  const boundsHelper = useRef<Box3Helper>(null);
  const anchorLine = useMemo(() => new Line(
    new BufferGeometry(), new LineBasicMaterial({ color: '#fff34d', depthTest: false }),
  ), []);
  const axisLine = useMemo(() => new Line(
    new BufferGeometry(), new LineBasicMaterial({ color: '#43ff64', depthTest: false }),
  ), []);

  useEffect(() => () => {
    anchorLine.geometry.dispose();
    (anchorLine.material as LineBasicMaterial).dispose();
    axisLine.geometry.dispose();
    (axisLine.material as LineBasicMaterial).dispose();
  }, [anchorLine, axisLine]);

  useFrame(() => {
    const articulation = joint.articulation;
    const mesh = findMountedMesh(scene, joint.nodeId);
    const parent = articulation?.parentAnchorWorld && new Vector3(...articulation.parentAnchorWorld);
    if (!articulation?.hasActiveHandle || !mesh || !parent) {
      if (helperGroup.current) helperGroup.current.visible = false;
      return;
    }

    // Every derived helper is recalculated from the actual mounted object, not the
    // node's authored transform. This also catches a substituted or wrongly scaled mesh.
    mesh.updateWorldMatrix(true, false);
    const child = mountedChildAnchorWorld(mesh, joint.childAnchor);
    if (!child) {
      if (helperGroup.current) helperGroup.current.visible = false;
      return;
    }
    if (helperGroup.current) helperGroup.current.visible = true;
    parentMarker.current?.position.copy(parent);
    childMarker.current?.position.copy(child);
    parentLabel.current?.position.copy(parent).addScalar(0.12);
    childLabel.current?.position.copy(child).addScalar(0.12);
    anchorLine.geometry.setFromPoints([parent, child]);

    const axis = mountedChildAxisWorld(mesh, joint.childAxis ?? [0, 0, 1])!;
    const halfAxis = axis.multiplyScalar(DEBUG_AXIS_LENGTH / 2);
    axisLine.geometry.setFromPoints([
      parent.clone().sub(halfAxis), parent.clone().add(halfAxis),
    ]);

    if (boundsHelper.current) {
      mesh.geometry.computeBoundingBox();
      const worldBounds = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
      if (worldBounds) {
        boundsHelper.current.box.copy(worldBounds);
        boundsHelper.current.updateMatrixWorld(true);
      }
    }
  });

  const initialBounds = useMemo(() => new Box3(new Vector3(), new Vector3()), []);
  return <group ref={helperGroup} visible={false}>
    <mesh ref={parentMarker} renderOrder={1000}>
      <sphereGeometry args={[0.12, 20, 12]} />
      <meshBasicMaterial color="#ff2bd6" depthTest={false} />
    </mesh>
    <mesh ref={childMarker} renderOrder={1000}>
      <sphereGeometry args={[0.1, 20, 12]} />
      <meshBasicMaterial color="#26f7ff" depthTest={false} />
    </mesh>
    <primitive object={anchorLine} renderOrder={999} />
    {joint.kind === 'revolute' ? <primitive object={axisLine} renderOrder={1000} /> : null}
    <group ref={parentLabel}><Html center style={{ color: '#ff7bea', font: 'bold 11px monospace', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      joint {joint.articulation?.id}
    </Html></group>
    <group ref={childLabel}><Html center style={{ color: '#75faff', font: 'bold 11px monospace', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      node {joint.nodeId}
    </Html></group>
    {showBoundingBox ? <box3Helper ref={boundsHelper} args={[initialBounds, '#ff9f1c']} /> : null}
  </group>;
}

function ArticulationDebugOverlay({ document, showBoundingBox }: { document: SpatialDocument; showBoundingBox: boolean }) {
  return <>{(document.physicsJoints ?? [])
    .filter((joint) => joint.articulation?.hasActiveHandle)
    .map((joint) => <ArticulationDebugJoint key={joint.articulation!.id} joint={joint} showBoundingBox={showBoundingBox} />)}</>;
}

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
      const mountedBodyAnchor = mountedChildAnchorWorld(mesh, joint.childAnchor);
      const parent = articulation.parentAnchorWorld ? new Vector3(...articulation.parentAnchorWorld) : undefined;
      // This is deliberately the endpoint of the mounted geometry.  A body-local
      // anchor reconstruction can agree with physics even when the mesh itself
      // was mounted with a completely unrelated transform.
      const pivotError = parent ? parent.distanceTo(top) : undefined;
      const bodyAnchorReconstructionError = parent && mountedBodyAnchor
        ? parent.distanceTo(mountedBodyAnchor) : undefined;
      const error = pivotError !== undefined && !Number.isFinite(pivotError) ? 'non-finite-mounted-geometry-pivot-error'
        : pivotError !== undefined && pivotError > MOUNTED_GEOMETRY_PIVOT_TOLERANCE ? 'mounted-geometry-pivot-error' : undefined;
      const node = document.renderNodes.find(({ id }) => id === nodeId);
      return [{ ...base, nodeTransform: node?.transform, nodeWorldTransform: node?.worldTransform,
        renderTransform: node?.renderTransform, mountedLocalPosition: vectorTuple(mesh.position),
        parentObjectType: mesh.parent?.type, parentMatrix: mesh.parent ? matrixElements(mesh.parent.matrixWorld) : undefined,
        matrixWorld: matrixElements(mesh.matrixWorld), worldPosition: vectorTuple(position), worldQuaternion: quaternionTuple(quaternion), worldScale: vectorTuple(scale), mountedGeometryTop: vectorTuple(top), topWorldPosition: vectorTuple(top), mountedBodyAnchorWorld: mountedBodyAnchor ? vectorTuple(mountedBodyAnchor) : undefined, bodyAnchorReconstructionError, worldBoundingBox: bounds ? boxTuple(bounds) : undefined, parentAnchorWorld: articulation.parentAnchorWorld, pivotError, error }];
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
    const pose = secondaryCameraPose(node.renderTransform ?? node.transform);
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
  articulationDebugOverlay = false,
  articulationDebugBoundingBox = false,
}: SceneRootProps) {
  const orbitTarget = useMemo(() => {
    const selectedNode = selectedOrbitNode(spatialDocument, selectedNodeId);

    return selectedNode?.renderTransform?.position ?? selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
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
      {articulationDebugOverlay ? <ArticulationDebugOverlay
        document={spatialDocument}
        showBoundingBox={articulationDebugBoundingBox}
      /> : null}
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
