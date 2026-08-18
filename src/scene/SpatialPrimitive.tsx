import { Edges, RoundedBoxGeometry } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshPhysicalMaterialParameters, MeshStandardMaterialParameters } from 'three';
import type { Mesh } from 'three';
import { useRef } from 'react';
import type { SpatialGeometry } from '../model/geometry';
import { normalizedXyzDslStrength, normalizedRoundedBoxRadius } from './primitiveGeometry';
import type { SpatialNode } from '../model/SpatialNode';
import { defaultBoxMaterial, unionHighlightMaterial } from './materials';
import { resolveMaterialTextures } from './textureRegistry';

/** The authoritative pose consumed by a flattened render-node mesh. */
export function spatialPrimitiveTransform(node: SpatialNode) {
  return node.worldTransform ?? node.transform;
}

interface SpatialPrimitiveProps {
  node: SpatialNode;
  physicsEntityId?: string;
  isSelected?: boolean;
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

function textureBumpScale(node: SpatialNode): number | undefined {
  const bumpStrength = normalizedXyzDslStrength(node.material.textures?.bumpMap?.strength);

  return bumpStrength === undefined ? undefined : bumpStrength * 0.045;
}

export function materialParameters(node: SpatialNode): MeshPhysicalMaterialParameters {
  const textureParameters = resolveMaterialTextures(node.material);
  const bumpScale = textureBumpScale(node);

  return {
    ...defaultBoxMaterial,
    color: node.material.color ?? defaultBoxMaterial.color,
    metalness: node.material.metalness ?? defaultBoxMaterial.metalness,
    roughness: node.material.roughness ?? defaultBoxMaterial.roughness,
    reflectivity: node.material.reflectivity,
    clearcoat: node.material.clearcoat,
    opacity: node.material.opacity,
    transmission: node.material.transmission,
    ior: node.material.ior,
    transparent: node.material.opacity !== undefined && node.material.opacity < 1,
    ...textureParameters,
    ...(textureParameters.bumpMap && bumpScale !== undefined ? { bumpScale } : {}),
    ...(node.unionGroupId ? unionHighlightMaterial : {}),
  };
}

export function needsPhysicalMaterial(node: SpatialNode): boolean {
  return Boolean(
    node.material.textures?.normalMap ||
      node.material.reflectivity !== undefined ||
      node.material.clearcoat !== undefined ||
      node.material.transmission !== undefined ||
      node.material.ior !== undefined,
  );
}

export function SpatialPrimitive({ node, physicsEntityId, isSelected = false, onSelect }: SpatialPrimitiveProps) {
  const mountedMeshRef = useRef<Mesh>(null);
  const { position, rotation, scale } = spatialPrimitiveTransform(node);
  const material = materialParameters(node);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect?.(node.id);
  }

  return (
    <mesh
      ref={mountedMeshRef}
      castShadow
      receiveShadow
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={handleClick}
      userData={{
        spatialNodeId: node.id,
        fullStableNodeId: node.id,
        physicsEntityId,
        unionGroupId: node.unionGroupId,
        geometry: node.geometry.kind,
        rotation,
      }}
    >
      <PrimitiveGeometry geometry={node.geometry} />
      {isSelected ? <Edges color="#facc15" scale={1.03} /> : null}
      {needsPhysicalMaterial(node) ? (
        <meshPhysicalMaterial {...material} />
      ) : (
        <meshStandardMaterial {...(material as MeshStandardMaterialParameters)} />
      )}
    </mesh>
  );
}
