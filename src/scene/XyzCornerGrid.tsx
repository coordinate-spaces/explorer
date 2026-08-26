import { useMemo } from 'react';
import { DECIMETRES_PER_UNIT } from '../model/units';

// Keep each plane just inside its axis so intersecting lines remain visible.
const LINE_OFFSET = 0.0015;
const METRE_LINE_GAP = 0.012;

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
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const x = step / DECIMETRES_PER_UNIT;
      positions.push(x, LINE_OFFSET, 0, x, LINE_OFFSET, depth);
    }

    for (let step = 0; step <= zMax; step += 1) {
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const z = step / DECIMETRES_PER_UNIT;
      positions.push(0, LINE_OFFSET, z, width, LINE_OFFSET, z);
    }
  }

  if (plane === 'backWall') {
    for (let step = 0; step <= xMax; step += 1) {
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const x = step / DECIMETRES_PER_UNIT;
      positions.push(x, 0, LINE_OFFSET, x, height, LINE_OFFSET);
    }

    for (let step = 0; step <= yMax; step += 1) {
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const y = step / DECIMETRES_PER_UNIT;
      positions.push(0, y, LINE_OFFSET, width, y, LINE_OFFSET);
    }
  }

  if (plane === 'sideWall') {
    for (let step = 0; step <= zMax; step += 1) {
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const z = step / DECIMETRES_PER_UNIT;
      positions.push(LINE_OFFSET, 0, z, LINE_OFFSET, height, z);
    }

    for (let step = 0; step <= yMax; step += 1) {
      if (step % DECIMETRES_PER_UNIT === 0) continue;
      const y = step / DECIMETRES_PER_UNIT;
      positions.push(LINE_OFFSET, y, 0, LINE_OFFSET, y, depth);
    }
  }

  return new Float32Array(positions);
}

export function createMetreCornerGridLinePositions({ plane, width, depth, height }: CornerLinesProps): Float32Array {
  const positions: number[] = [];
  const halfGap = METRE_LINE_GAP / 2;

  const addDoubleLine = (start: [number, number, number], end: [number, number, number], axis: 0 | 1 | 2) => {
    for (const offset of [-halfGap, halfGap]) {
      const offsetStart = [...start] as [number, number, number];
      const offsetEnd = [...end] as [number, number, number];
      offsetStart[axis] += offset;
      offsetEnd[axis] += offset;
      positions.push(...offsetStart, ...offsetEnd);
    }
  };

  if (plane === 'floor') {
    for (let x = 0; x <= Math.floor(width); x += 1) {
      addDoubleLine([x, LINE_OFFSET * 2, 0], [x, LINE_OFFSET * 2, depth], 0);
    }
    for (let z = 0; z <= Math.floor(depth); z += 1) {
      addDoubleLine([0, LINE_OFFSET * 2, z], [width, LINE_OFFSET * 2, z], 2);
    }
  }

  if (plane === 'backWall') {
    for (let x = 0; x <= Math.floor(width); x += 1) {
      addDoubleLine([x, 0, LINE_OFFSET * 2], [x, height, LINE_OFFSET * 2], 0);
    }
    for (let y = 0; y <= Math.floor(height); y += 1) {
      addDoubleLine([0, y, LINE_OFFSET * 2], [width, y, LINE_OFFSET * 2], 1);
    }
  }

  if (plane === 'sideWall') {
    for (let z = 0; z <= Math.floor(depth); z += 1) {
      addDoubleLine([LINE_OFFSET * 2, 0, z], [LINE_OFFSET * 2, height, z], 2);
    }
    for (let y = 0; y <= Math.floor(height); y += 1) {
      addDoubleLine([LINE_OFFSET * 2, y, 0], [LINE_OFFSET * 2, y, depth], 1);
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

function MetreCornerLines(props: CornerLinesProps) {
  const positions = useMemo(
    () => createMetreCornerGridLinePositions(props),
    [props.plane, props.width, props.depth, props.height],
  );

  return (
    <lineSegments renderOrder={2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" opacity={0.48} transparent depthWrite={false} />
    </lineSegments>
  );
}

export function XyzCornerGrid({ width, depth, height }: XyzCornerGridProps) {
  return (
    <group>
      <CornerLines plane="floor" width={width} depth={depth} height={height} />
      <CornerLines plane="backWall" width={width} depth={depth} height={height} />
      <CornerLines plane="sideWall" width={width} depth={depth} height={height} />
      <MetreCornerLines plane="floor" width={width} depth={depth} height={height} />
      <MetreCornerLines plane="backWall" width={width} depth={depth} height={height} />
      <MetreCornerLines plane="sideWall" width={width} depth={depth} height={height} />
    </group>
  );
}
