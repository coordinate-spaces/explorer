import { Component, Suspense, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { Edges, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import { Box3, Color, type Material, type Mesh } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { resolveModelUrl } from '../model/resolveModelUrl';
import { modelFitTransformFromBounds } from './modelFit';

function ModelBox({ color }: { color: string }) {
  return <mesh><boxGeometry /><meshStandardMaterial color={color} wireframe transparent opacity={0.45} /></mesh>;
}

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unable to render GLB model.', error, info); }
  render() { return this.state.failed ? <ModelBox color="#ef4444" /> : this.props.children; }
}

function LoadedModel({ source, fit, align, node, targetScale }: { source: string; fit: 'contain' | 'stretch'; align: 'center' | 'floor'; node: SpatialNode; targetScale: [number, number, number] }) {
  const gltf = useGLTF(source);
  const imported = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    const ownedMaterials = new Set<Material>();
    clone.traverse((object) => {
      if ('isLight' in object || 'isCamera' in object) object.visible = false;
      if (!('isMesh' in object)) return;
      const mesh = object as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (node.material.color === undefined && node.material.metalness === undefined && node.material.roughness === undefined) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone() as Material & { color?: Color; metalness?: number; roughness?: number };
        ownedMaterials.add(material);
        if (node.material.color !== undefined && material.color) material.color = new Color(node.material.color);
        if (node.material.metalness !== undefined && material.metalness !== undefined) material.metalness = node.material.metalness;
        if (node.material.roughness !== undefined && material.roughness !== undefined) material.roughness = node.material.roughness;
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    clone.updateWorldMatrix(true, true);
    return { scene: clone, bounds: new Box3().setFromObject(clone), ownedMaterials };
  }, [gltf.scene, node.material.color, node.material.metalness, node.material.roughness]);
  useEffect(() => () => imported.ownedMaterials.forEach((material) => material.dispose()), [imported]);
  const fitted = useMemo(
    () => modelFitTransformFromBounds(imported.bounds, fit, align, targetScale),
    [imported.bounds, fit, align, targetScale],
  );
  return <group scale={fitted.scale}><group position={fitted.position}><primitive object={imported.scene} /></group></group>;
}

function ResolvedModel({ model, node, targetScale }: { model: NonNullable<SpatialNode['model']>; node: SpatialNode; targetScale: [number, number, number] }) {
  const source = resolveModelUrl(model.source!);
  return <LoadedModel source={source} fit={model.fit} align={model.align} node={node} targetScale={targetScale} />;
}

export function ModelPrimitive({ node, isSelected = false, onSelect }: { node: SpatialNode; isSelected?: boolean; onSelect?: (id: string) => void }) {
  const model = node.model!;
  const { position, rotation, scale } = node.transform;
  function handleClick(event: ThreeEvent<MouseEvent>) { event.stopPropagation(); onSelect?.(node.id); }

  return <group position={position} rotation={rotation} scale={scale} onClick={handleClick} userData={{ spatialNodeId: node.id, model: model.source }}>
    <ModelErrorBoundary key={`${model.source}:${model.fit}:${model.align}`}>
      <Suspense fallback={<ModelBox color="#60a5fa" />}><ResolvedModel model={model} node={node} targetScale={scale} /></Suspense>
    </ModelErrorBoundary>
    <mesh scale={isSelected ? 1.03 : 1}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      {isSelected ? <Edges color="#facc15" /> : null}
    </mesh>
  </group>;
}
