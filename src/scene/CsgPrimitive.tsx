import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { CsgExpression } from '../model/csg';
import { materialParameters } from './SpatialPrimitive';
import { evaluateCsgExpressionGeometry } from './csgGeometry';

interface CsgPrimitiveProps {
  expression: CsgExpression;
  onSelect?: (id: string) => void;
  selectionEnabled?: boolean;
}

export function CsgPrimitive({ expression, onSelect, selectionEnabled = true }: CsgPrimitiveProps) {
  const geometry = useMemo(() => evaluateCsgExpressionGeometry(expression), [expression]);
  const material = materialParameters(expression.base);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (selectionEnabled) onSelect?.(expression.base.id);
  }

  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      onClick={handleClick}
      userData={{ spatialNodeId: expression.base.id, csgExpressionId: expression.id }}
    >
      <meshStandardMaterial {...material} />
    </mesh>
  );
}
