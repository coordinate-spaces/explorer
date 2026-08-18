import { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Brush, Evaluator, INTERSECTION, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import type { MeshStandardMaterialParameters } from 'three';
import type { CsgExpression, CsgOperationNode } from '../model/csg';
import type { SpatialNode } from '../model/SpatialNode';
import { materialParameters, needsPhysicalMaterial, spatialPrimitiveTransform } from './SpatialPrimitive';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';

interface CsgPrimitiveProps {
  expression: CsgExpression;
  physicsEntityId?: string;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

function brushFor(node: SpatialNode): Brush {
  const brush = new Brush(bufferGeometryForSpatialGeometry(node.geometry));
  const { position, rotation, scale } = spatialPrimitiveTransform(node);
  brush.position.set(...position);
  brush.rotation.set(...rotation);
  brush.scale.set(...scale);
  brush.updateMatrixWorld(true);
  brush.geometry.applyMatrix4(brush.matrixWorld);
  brush.position.set(0, 0, 0);
  brush.rotation.set(0, 0, 0);
  brush.scale.set(1, 1, 1);
  brush.updateMatrixWorld(true);
  return brush;
}

function csgOperation({ op }: CsgOperationNode) {
  switch (op) {
    case 'union':
      return ADDITION;
    case 'intersection':
      return INTERSECTION;
    case 'subtraction':
    default:
      return SUBTRACTION;
  }
}

export function CsgPrimitive({ expression, physicsEntityId, isSelected = false, onSelect }: CsgPrimitiveProps) {
  const geometry = useMemo(() => {
    const evaluator = new Evaluator();
    evaluator.attributes = ['position', 'normal', 'uv'];
    let result = brushFor(expression.base);

    expression.operations.forEach((operation) => {
      result = evaluator.evaluate(result, brushFor(operation.tool), csgOperation(operation));
    });

    return result.geometry;
  }, [expression]);
  const material = materialParameters(expression.base);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect?.(expression.base.id);
  }

  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      onClick={handleClick}
      userData={{
        spatialNodeId: expression.base.id,
        fullStableNodeId: expression.base.id,
        physicsEntityId,
        csgExpressionId: expression.id,
        geometryInWorldSpace: true,
        authoredJointAnchor: expression.base.physics?.['joint-anchor'],
      }}
    >
      {isSelected ? <Edges color="#facc15" /> : null}
      {needsPhysicalMaterial(expression.base) ? (
        <meshPhysicalMaterial {...material} />
      ) : (
        <meshStandardMaterial {...(material as MeshStandardMaterialParameters)} />
      )}
    </mesh>
  );
}
