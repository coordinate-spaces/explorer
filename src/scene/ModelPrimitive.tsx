import { Component, Suspense, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { Edges, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import { Color, type Material, type Mesh } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { resolveModelUrl } from '../model/resolveModelUrl';
import { modelFitTransform } from './modelFit';

function ModelBox({ color }: { color: string }) {
  return <mesh><boxGeometry /><meshStandardMaterial color={color} wireframe transparent opacity={0.45} /></mesh>;
}

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unable to render GLB model.', error, info); }
  render() { return this.state.failed ? <ModelBox color="#ef4444" /> : this.props.children; }
}

function LoadedModel({ source, fit, align, node }: { source: string; fit: 'contain' | 'stretch'; align: 'center' | 'floor'; node: SpatialNode }) {
  const gltf = useGLTF(source);
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((object) => {
      if ('isLight' in object || 'isCamera' in object) object.visible = false;
      if (!('isMesh' in object)) return;
      const mesh = object as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (node.material.color === undefined && node.material.metalness === undefined && node.material.roughness === undefined) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone() as Material & { color?: Color; metalness?: number; roughness?: number };
        if (node.material.color !== undefined && material.color) material.color = new Color(node.material.color);
        if (node.material.metalness !== undefined && material.metalness !== undefined) material.metalness = node.material.metalness;
        if (node.material.roughness !== undefined && material.roughness !== undefined) material.roughness = node.material.roughness;
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    return clone;
  }, [gltf.scene, node.material.color, node.material.metalness, node.material.roughness]);
  const fitted = useMemo(() => modelFitTransform(scene, fit, align), [scene, fit, align]);
  return <group scale={fitted.scale}><primitive object={scene} position={fitted.position} /></group>;
}

export function ModelPrimitive({ node, isSelected = false, onSelect }: { node: SpatialNode; isSelected?: boolean; onSelect?: (id: string) => void }) {
  const model = node.model!;
  const source = resolveModelUrl(model.source!);
  const { position, rotation, scale } = node.transform;
  function handleClick(event: ThreeEvent<MouseEvent>) { event.stopPropagation(); onSelect?.(node.id); }

  return <group position={position} rotation={rotation} scale={scale} onClick={handleClick} userData={{ spatialNodeId: node.id, model: source }}>
    <ModelErrorBoundary key={source}>
      <Suspense fallback={<ModelBox color="#60a5fa" />}><LoadedModel source={source} fit={model.fit} align={model.align} node={node} /></Suspense>
    </ModelErrorBoundary>
    {isSelected ? <mesh scale={1.03}><boxGeometry /><meshBasicMaterial transparent opacity={0} /><Edges color="#facc15" /></mesh> : null}
  </group>;
}
