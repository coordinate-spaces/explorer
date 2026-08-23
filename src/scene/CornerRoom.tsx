import { useMemo } from 'react';
import { floorMaterial, wallMaterial } from './materials';

// 1.5 mm prevents z-fighting without visibly lifting the grid.
const GRID_OFFSET = 0.0015;

interface CornerRoomProps {
  width: number;
  depth: number;
  height: number;
}

type GridPlane = 'floor' | 'backWall' | 'sideWall';

interface UnitGridProps {
  plane: GridPlane;
  width: number;
  depth: number;
  height: number;
}

function createUnitGridPositions({ plane, width, depth, height }: UnitGridProps): Float32Array {
  const positions: number[] = [];
  const xMax = Math.ceil(width);
  const yMax = Math.ceil(height);
  const zMax = Math.ceil(depth);

  if (plane === 'floor') {
    for (let x = 0; x <= xMax; x += 1) {
      positions.push(x, GRID_OFFSET, 0, x, GRID_OFFSET, depth);
    }

    for (let z = 0; z <= zMax; z += 1) {
      positions.push(0, GRID_OFFSET, z, width, GRID_OFFSET, z);
    }
  }

  if (plane === 'backWall') {
    for (let x = 0; x <= xMax; x += 1) {
      positions.push(x, 0, GRID_OFFSET, x, height, GRID_OFFSET);
    }

    for (let y = 0; y <= yMax; y += 1) {
      positions.push(0, y, GRID_OFFSET, width, y, GRID_OFFSET);
    }
  }

  if (plane === 'sideWall') {
    for (let z = 0; z <= zMax; z += 1) {
      positions.push(GRID_OFFSET, 0, z, GRID_OFFSET, height, z);
    }

    for (let y = 0; y <= yMax; y += 1) {
      positions.push(GRID_OFFSET, y, 0, GRID_OFFSET, y, depth);
    }
  }

  return new Float32Array(positions);
}

function UnitGrid(props: UnitGridProps) {
  const positions = useMemo(() => createUnitGridPositions(props), [props.plane, props.width, props.depth, props.height]);

  return (
    <lineSegments renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" opacity={0.22} transparent depthWrite={false} />
    </lineSegments>
  );
}

export function CornerRoom({ width, depth, height }: CornerRoomProps) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial {...floorMaterial} />
      </mesh>

      <mesh receiveShadow position={[width / 2, height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial {...wallMaterial} />
      </mesh>

      <mesh receiveShadow rotation={[0, Math.PI / 2, 0]} position={[0, height / 2, depth / 2]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial {...wallMaterial} color="#cfc8bc" />
      </mesh>

      <UnitGrid plane="floor" width={width} depth={depth} height={height} />
      <UnitGrid plane="backWall" width={width} depth={depth} height={height} />
      <UnitGrid plane="sideWall" width={width} depth={depth} height={height} />
    </group>
  );
}
