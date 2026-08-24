import { Edges, RoundedBoxGeometry } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshStandardMaterialParameters } from 'three';
import type { SpatialGeometry } from '../model/geometry';
import { normalizedXyzDslStrength, normalizedRoundedBoxRadius } from './primitiveGeometry';
import type { SpatialNode } from '../model/SpatialNode';
import { defaultBoxMaterial, unionHighlightMaterial } from './materials';

interface SpatialPrimitiveProps {
  node: SpatialNode;
  isSelected?: boolean;
  isPreview?: boolean;
  onSelect?: (id: string) => void;
}

function PrimitiveGeometry({ geometry }: { geometry: SpatialGeometry }) {
  switch (geometry.kind) {
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 48]} />;
    case 'cone':
      return <coneGeometry args={[0.5, 1, 48]} />;
    case 'sphere':
      return <sphereGeometry args={[0.5, 48, 24]} />;
    case 'box': {
      const radius = normalizedRoundedBoxRadius(geometry);

      if (radius > 0) {
        const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;

        return <RoundedBoxGeometry args={[1, 1, 1]} radius={radius} smoothness={8 + Math.round(puff * 8)} bevelSegments={4} />;
      }

      return <boxGeometry args={[1, 1, 1]} />;
    }
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

export function materialParameters(node: SpatialNode): MeshStandardMaterialParameters {
  return {
    ...defaultBoxMaterial,
    color: node.material.color ?? defaultBoxMaterial.color,
    metalness: node.material.metalness ?? defaultBoxMaterial.metalness,
    roughness: node.material.roughness ?? defaultBoxMaterial.roughness,
    ...(node.unionGroupId ? unionHighlightMaterial : {}),
  };
}

export function SpatialPrimitive({ node, isSelected = false, isPreview = false, onSelect }: SpatialPrimitiveProps) {
  const { position, rotation, scale } = node.transform;
  const material = materialParameters(node);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect?.(node.id);
  }

  return (
    <mesh
      castShadow={!isPreview}
      receiveShadow={!isPreview}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={handleClick}
      userData={{
        spatialNodeId: node.id,
        unionGroupId: node.unionGroupId,
        geometry: node.geometry.kind,
        rotation,
      }}
    >
      <PrimitiveGeometry geometry={node.geometry} />
      {isSelected || isPreview ? <Edges color={isPreview ? '#67e8f9' : '#facc15'} scale={1.03} /> : null}
      <meshStandardMaterial {...material} transparent={isPreview} opacity={isPreview ? 0.48 : 1} depthWrite={!isPreview} />
    </mesh>
  );
}
