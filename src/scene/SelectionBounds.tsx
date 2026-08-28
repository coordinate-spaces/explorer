import { Edges } from '@react-three/drei';
import type { SpatialBounds } from '../model/SpatialNode';

export function selectionBoundsTransform(bounds: SpatialBounds): {
  position: [number, number, number];
  scale: [number, number, number];
} {
  return {
    position: [
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2,
    ],
    scale: [
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
      bounds.maxZ - bounds.minZ,
    ],
  };
}

export function SelectionBounds({ bounds }: { bounds: SpatialBounds }) {
  const { position, scale } = selectionBoundsTransform(bounds);

  return (
    <mesh position={position} scale={scale} userData={{ povCollisionIgnored: true }}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color="#facc15" />
    </mesh>
  );
}
