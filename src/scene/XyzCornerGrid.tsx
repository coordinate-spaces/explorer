import { useMemo } from 'react';
import { DECIMETRES_PER_UNIT } from '../model/units';

// Keep each plane just inside its axis so intersecting lines remain visible.
const LINE_OFFSET = 0.0015;

interface XyzCornerGridProps {
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

export function createCornerGridLinePositions({ plane, width, depth, height }: CornerLinesProps): Float32Array {
  const positions: number[] = [];
  const xMax = Math.ceil(width * DECIMETRES_PER_UNIT);
  const yMax = Math.ceil(height * DECIMETRES_PER_UNIT);
  const zMax = Math.ceil(depth * DECIMETRES_PER_UNIT);

  if (plane === 'floor') {
    for (let step = 0; step <= xMax; step += 1) {
      const x = step / DECIMETRES_PER_UNIT;
      positions.push(x, LINE_OFFSET, 0, x, LINE_OFFSET, depth);
    }

    for (let step = 0; step <= zMax; step += 1) {
      const z = step / DECIMETRES_PER_UNIT;
      positions.push(0, LINE_OFFSET, z, width, LINE_OFFSET, z);
    }
  }

  if (plane === 'backWall') {
    for (let step = 0; step <= xMax; step += 1) {
      const x = step / DECIMETRES_PER_UNIT;
      positions.push(x, 0, LINE_OFFSET, x, height, LINE_OFFSET);
    }

    for (let step = 0; step <= yMax; step += 1) {
      const y = step / DECIMETRES_PER_UNIT;
      positions.push(0, y, LINE_OFFSET, width, y, LINE_OFFSET);
    }
  }

  if (plane === 'sideWall') {
    for (let step = 0; step <= zMax; step += 1) {
      const z = step / DECIMETRES_PER_UNIT;
      positions.push(LINE_OFFSET, 0, z, LINE_OFFSET, height, z);
    }

    for (let step = 0; step <= yMax; step += 1) {
      const y = step / DECIMETRES_PER_UNIT;
      positions.push(LINE_OFFSET, y, 0, LINE_OFFSET, y, depth);
    }
  }

  return new Float32Array(positions);
}

function CornerLines(props: CornerLinesProps) {
  const positions = useMemo(() => createCornerGridLinePositions(props), [props.plane, props.width, props.depth, props.height]);

  return (
    <lineSegments renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" opacity={0.22} transparent depthWrite={false} />
    </lineSegments>
  );
}

export function XyzCornerGrid({ width, depth, height }: XyzCornerGridProps) {
  return (
    <group>
      <CornerLines plane="floor" width={width} depth={depth} height={height} />
      <CornerLines plane="backWall" width={width} depth={depth} height={height} />
      <CornerLines plane="sideWall" width={width} depth={depth} height={height} />
    </group>
  );
}
