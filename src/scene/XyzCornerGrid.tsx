import { useMemo } from 'react';
import { floorMaterial, wallMaterial } from './materials';

// Keep the grid far enough in front of the filled surfaces to remain stable when
// the depth buffer loses precision at the far end of the room.
export const GRID_OFFSET = 0.003;
export const DECIMETRE_GRID_SPACING = 0.1;
export const GRID_DEPTH_MATERIAL = {
  depthTest: true,
  depthWrite: false,
} as const;
// WebGL polygon offset only affects filled primitives, so bias the room planes
// away from the camera rather than attempting to bias GL_LINES.
export const GRID_SURFACE_DEPTH_BIAS = {
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
} as const;

export type GridPlane = 'xy' | 'xz' | 'yz';
export type GridPoint = [number, number, number];
export type GridLineSegment = [GridPoint, GridPoint];

export interface GridPlaneLines {
  decimetres: GridLineSegment[];
  metres: GridLineSegment[];
}

export type XyzGridLines = Record<GridPlane, GridPlaneLines>;

interface XyzCornerGridProps {
  width: number;
  depth: number;
  height: number;
}

const COORDINATE_EPSILON = 1e-9;

function coordinatesThroughBoundary(length: number): number[] {
  const stepCount = Math.floor((length + COORDINATE_EPSILON) / DECIMETRE_GRID_SPACING);
  const coordinates = Array.from(
    { length: stepCount + 1 },
    (_, index) => Number((index * DECIMETRE_GRID_SPACING).toFixed(10)),
  );

  if (Math.abs(coordinates[coordinates.length - 1] - length) > COORDINATE_EPSILON) {
    coordinates.push(length);
  }

  return coordinates;
}

function isMetreBoundary(coordinate: number): boolean {
  return Math.abs(coordinate - Math.round(coordinate)) <= COORDINATE_EPSILON;
}

function emptyPlane(): GridPlaneLines {
  return { decimetres: [], metres: [] };
}

function addLine(lines: GridPlaneLines, coordinate: number, segment: GridLineSegment): void {
  (isMetreBoundary(coordinate) ? lines.metres : lines.decimetres).push(segment);
}

/** Generates independent decimetre and metre line segments for the three positive XYZ planes. */
export function createXyzGridLines({ width, depth, height }: XyzCornerGridProps): XyzGridLines {
  const grid: XyzGridLines = { xy: emptyPlane(), xz: emptyPlane(), yz: emptyPlane() };

  for (const x of coordinatesThroughBoundary(width)) {
    addLine(grid.xy, x, [[x, 0, GRID_OFFSET], [x, height, GRID_OFFSET]]);
    addLine(grid.xz, x, [[x, GRID_OFFSET, 0], [x, GRID_OFFSET, depth]]);
  }
  for (const y of coordinatesThroughBoundary(height)) {
    addLine(grid.xy, y, [[0, y, GRID_OFFSET], [width, y, GRID_OFFSET]]);
    addLine(grid.yz, y, [[GRID_OFFSET, y, 0], [GRID_OFFSET, y, depth]]);
  }
  for (const z of coordinatesThroughBoundary(depth)) {
    addLine(grid.xz, z, [[0, GRID_OFFSET, z], [width, GRID_OFFSET, z]]);
    addLine(grid.yz, z, [[GRID_OFFSET, 0, z], [GRID_OFFSET, height, z]]);
  }

  return grid;
}

function GridLayer({ lines, metres }: { lines: GridLineSegment[]; metres: boolean }) {
  const positions = useMemo(() => flattenGridLines(lines), [lines]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <lineSegments renderOrder={metres ? 2 : 1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#ffffff"
        opacity={metres ? 0.55 : 0.18}
        transparent
        {...GRID_DEPTH_MATERIAL}
      />
    </lineSegments>
  );
}

/** Converts classified segments to the non-indexed position buffer used by Three.js lines. */
export function flattenGridLines(lines: GridLineSegment[]): Float32Array {
  const positions = new Float32Array(lines.length * 6);
  let offset = 0;

  for (const [start, end] of lines) {
    positions.set(start, offset);
    positions.set(end, offset + 3);
    offset += 6;
  }

  return positions;
}

export function XyzCornerGrid({ width, depth, height }: XyzCornerGridProps) {
  const grid = useMemo(() => createXyzGridLines({ width, depth, height }), [width, depth, height]);

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]} userData={{ povCollisionSurface: true }}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial {...floorMaterial} {...GRID_SURFACE_DEPTH_BIAS} />
      </mesh>

      <mesh receiveShadow position={[width / 2, height / 2, 0]} userData={{ povCollisionSurface: true }}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial {...wallMaterial} {...GRID_SURFACE_DEPTH_BIAS} />
      </mesh>

      <mesh receiveShadow rotation={[0, Math.PI / 2, 0]} position={[0, height / 2, depth / 2]} userData={{ povCollisionSurface: true }}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial {...wallMaterial} {...GRID_SURFACE_DEPTH_BIAS} color="#cfc8bc" />
      </mesh>

      {(['xy', 'xz', 'yz'] as const).map((plane) => (
        <group key={plane}>
          <GridLayer lines={grid[plane].decimetres} metres={false} />
          <GridLayer lines={grid[plane].metres} metres />
        </group>
      ))}
    </group>
  );
}
