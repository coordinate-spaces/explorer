import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import type { BufferGeometry } from 'three';
import type { CsgExpression, CsgOperationNode } from '../model/csg';
import type { SpatialNode } from '../model/SpatialNode';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';

function brushFor(node: SpatialNode): Brush {
  const brush = new Brush(bufferGeometryForSpatialGeometry(node.geometry));
  const { position, rotation, scale } = node.transform;
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

export function evaluateCsgExpressionGeometry(expression: CsgExpression): BufferGeometry {
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv'];
  let result = brushFor(expression.base);

  expression.operations.forEach((operation) => {
    result = evaluator.evaluate(result, brushFor(operation.tool), csgOperation(operation));
  });

  return result.geometry;
}
