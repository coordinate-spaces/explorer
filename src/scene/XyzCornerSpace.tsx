import { useMemo } from 'react';

// Keep each plane just inside its axis so intersecting lines remain visible.
const LINE_OFFSET = 0.0015;

interface XyzCornerSpaceProps {
  width: number;
  depth: number;
  height: number;
}

type CornerPlane = 'floor' | 'backWall' | 'sideWall';

interface CornerLinesProps {
  plane: CornerPlane;
  width: number;
  depth: number;
  height: number;
}

export function createCornerLinePositions({ plane, width, depth, height }: CornerLinesProps): Float32Array {
  const positions: number[] = [];
  const xMax = Math.ceil(width);
  const yMax = Math.ceil(height);
  const zMax = Math.ceil(depth);

  if (plane === 'floor') {
    for (let x = 0; x <= xMax; x += 1) {
      positions.push(x, LINE_OFFSET, 0, x, LINE_OFFSET, depth);
    }

    for (let z = 0; z <= zMax; z += 1) {
      positions.push(0, LINE_OFFSET, z, width, LINE_OFFSET, z);
    }
  }

  if (plane === 'backWall') {
    for (let x = 0; x <= xMax; x += 1) {
      positions.push(x, 0, LINE_OFFSET, x, height, LINE_OFFSET);
    }

    for (let y = 0; y <= yMax; y += 1) {
      positions.push(0, y, LINE_OFFSET, width, y, LINE_OFFSET);
    }
  }

  if (plane === 'sideWall') {
    for (let z = 0; z <= zMax; z += 1) {
      positions.push(LINE_OFFSET, 0, z, LINE_OFFSET, height, z);
    }

    for (let y = 0; y <= yMax; y += 1) {
      positions.push(LINE_OFFSET, y, 0, LINE_OFFSET, y, depth);
    }
  }

  return new Float32Array(positions);
}

function CornerLines(props: CornerLinesProps) {
  const positions = useMemo(() => createCornerLinePositions(props), [props.plane, props.width, props.depth, props.height]);

  return (
    <lineSegments renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" opacity={0.22} transparent depthWrite={false} />
    </lineSegments>
  );
}

export function XyzCornerSpace({ width, depth, height }: XyzCornerSpaceProps) {
  return (
    <group>
      <CornerLines plane="floor" width={width} depth={depth} height={height} />
      <CornerLines plane="backWall" width={width} depth={depth} height={height} />
      <CornerLines plane="sideWall" width={width} depth={depth} height={height} />
    </group>
  );
}
