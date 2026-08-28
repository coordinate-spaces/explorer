import { Edges } from '@react-three/drei';
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SpatialBounds, SpatialNode } from '../model/SpatialNode';
import { CONTENT_CARD_DEPTH } from './contentGeometry';

export function selectionBoundsForNode(node: SpatialNode): SpatialBounds {
  const rendersAsContentCard = node.renderable && node.content?.kind && !node.model?.source && !node.csgExpressionId;
  if (!rendersAsContentCard) return node.bounds;

  const { position, rotation, scale } = node.transform;
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation, 'XYZ')),
    new Vector3(...scale),
  );
  const renderedBounds = new Box3(
    new Vector3(-0.5, -0.5, -CONTENT_CARD_DEPTH / 2),
    new Vector3(0.5, 0.5, CONTENT_CARD_DEPTH / 2),
  ).applyMatrix4(matrix);

  return {
    minX: renderedBounds.min.x,
    maxX: renderedBounds.max.x,
    minY: renderedBounds.min.y,
    maxY: renderedBounds.max.y,
    minZ: renderedBounds.min.z,
    maxZ: renderedBounds.max.z,
  };
}

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

export function SelectionBounds({ node }: { node: SpatialNode }) {
  const { position, scale } = selectionBoundsTransform(selectionBoundsForNode(node));

  return (
    <mesh position={position} scale={scale} userData={{ povCollisionIgnored: true }}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color="#facc15" />
    </mesh>
  );
}
