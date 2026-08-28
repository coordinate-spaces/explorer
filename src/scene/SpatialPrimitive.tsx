import { RoundedBoxGeometry } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshStandardMaterialParameters } from 'three';
import type { SpatialGeometry } from '../model/geometry';
import { normalizedXyzDslStrength, normalizedRoundedBoxRadius } from './primitiveGeometry';
import type { SpatialNode } from '../model/SpatialNode';
import { defaultBoxMaterial, unionHighlightMaterial } from './materials';

interface SpatialPrimitiveProps {
  node: SpatialNode;
  onSelect?: (id: string) => void;
  selectionEnabled?: boolean;
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

export function SpatialPrimitive({ node, onSelect, selectionEnabled = true }: SpatialPrimitiveProps) {
  const { position, rotation, scale } = node.transform;
  const material = materialParameters(node);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (selectionEnabled) onSelect?.(node.id);
  }

  return (
    <mesh
      castShadow
      receiveShadow
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
      <meshStandardMaterial {...material} />
    </mesh>
  );
}
