import type { SpatialBounds, SpatialNode } from './SpatialNode';
import type { CoordinateSpaceDimensions } from './coordinateSpace';
import { boundsOverlap } from './collision';
import type { XyzDslInteractionState } from '../xyzdsl/types';

export interface InteractionFact {
  state: XyzDslInteractionState;
  targetId: string;
  targetNamespace: string;
  cursorId: string;
  cursorNamespace: string;
  streamId: string;
  transactionId?: string;
  transactionTime?: number;
  normal: [number, number, number];
  /** Per-axis direction away from the cursor, used when a contact normal is zero. */
  inferredDirection: [number, number, number];
  penetration?: number;
  separation?: number;
  cursorWeight?: number;
}

export interface SpatialInteractionIndex {
  query(bounds: SpatialBounds, tolerance?: number): SpatialNode[];
  update(node: SpatialNode): void;
  remove(nodeId: string): void;
}

function expanded(bounds: SpatialBounds, tolerance: number): SpatialBounds {
  return {
    minX: bounds.minX - tolerance, maxX: bounds.maxX + tolerance,
    minY: bounds.minY - tolerance, maxY: bounds.maxY + tolerance,
    minZ: bounds.minZ - tolerance, maxZ: bounds.maxZ + tolerance,
  };
}

/** A deterministic broad-phase index; its implementation can later become a spatial hash/BVH. */
export class AabbInteractionIndex implements SpatialInteractionIndex {
  private nodes = new Map<string, SpatialNode>();
  private cells = new Map<string, Set<string>>();
  private memberships = new Map<string, string[]>();

  constructor(nodes: readonly SpatialNode[] = [], private readonly cellSize = 10) {
    nodes.forEach((node) => this.update(node));
  }

  private keys(bounds: SpatialBounds): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(bounds.minX / this.cellSize); x <= Math.floor(bounds.maxX / this.cellSize); x += 1) {
      for (let y = Math.floor(bounds.minY / this.cellSize); y <= Math.floor(bounds.maxY / this.cellSize); y += 1) {
        for (let z = Math.floor(bounds.minZ / this.cellSize); z <= Math.floor(bounds.maxZ / this.cellSize); z += 1) {
          keys.push(`${x}:${y}:${z}`);
        }
      }
    }
    return keys;
  }

  query(bounds: SpatialBounds, tolerance = 0): SpatialNode[] {
    const queryBounds = expanded(bounds, tolerance);
    const candidateIds = new Set(this.keys(queryBounds).flatMap((key) => [...(this.cells.get(key) ?? [])]));
    return [...candidateIds].flatMap((id) => this.nodes.get(id) ?? [])
      .filter((node) => boundsOverlap(queryBounds, expanded(node.bounds, Number.EPSILON)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  update(node: SpatialNode): void {
    this.remove(node.id);
    this.nodes.set(node.id, node);
    const keys = this.keys(node.bounds);
    this.memberships.set(node.id, keys);
    keys.forEach((key) => {
      const cell = this.cells.get(key) ?? new Set<string>();
      cell.add(node.id);
      this.cells.set(key, cell);
    });
  }

  remove(nodeId: string): void {
    (this.memberships.get(nodeId) ?? []).forEach((key) => {
      const cell = this.cells.get(key);
      cell?.delete(nodeId);
      if (cell?.size === 0) this.cells.delete(key);
    });
    this.memberships.delete(nodeId);
    this.nodes.delete(nodeId);
  }
}

function center(bounds: SpatialBounds): [number, number, number] {
  return [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
}

function directionAwayFromCursor(target: SpatialBounds, cursor: SpatialBounds, axis: number): number {
  return center(target)[axis] < center(cursor)[axis] ? -1 : 1;
}

function breachDetails(target: SpatialBounds, cursor: SpatialBounds): Pick<InteractionFact, 'normal' | 'penetration'> {
  const overlaps = [
    Math.min(target.maxX, cursor.maxX) - Math.max(target.minX, cursor.minX),
    Math.min(target.maxY, cursor.maxY) - Math.max(target.minY, cursor.minY),
    Math.min(target.maxZ, cursor.maxZ) - Math.max(target.minZ, cursor.minZ),
  ];
  const axis = overlaps.indexOf(Math.min(...overlaps));
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = directionAwayFromCursor(target, cursor, axis);
  return { normal, penetration: overlaps[axis] };
}

function probeDetails(target: SpatialBounds, cursor: SpatialBounds, tolerance: number): Pick<InteractionFact, 'normal' | 'separation'> | undefined {
  const gaps = [
    Math.max(target.minX - cursor.maxX, cursor.minX - target.maxX, 0),
    Math.max(target.minY - cursor.maxY, cursor.minY - target.maxY, 0),
    Math.max(target.minZ - cursor.maxZ, cursor.minZ - target.maxZ, 0),
  ];
  if (gaps.some((gap) => gap > tolerance)) return undefined;
  const overlaps = [
    Math.min(target.maxX, cursor.maxX) - Math.max(target.minX, cursor.minX),
    Math.min(target.maxY, cursor.maxY) - Math.max(target.minY, cursor.minY),
    Math.min(target.maxZ, cursor.maxZ) - Math.max(target.minZ, cursor.minZ),
  ];
  const faceDistances = [
    Math.min(Math.abs(target.minX - cursor.maxX), Math.abs(cursor.minX - target.maxX)),
    Math.min(Math.abs(target.minY - cursor.maxY), Math.abs(cursor.minY - target.maxY)),
    Math.min(Math.abs(target.minZ - cursor.maxZ), Math.abs(cursor.minZ - target.maxZ)),
  ];
  const axis = [0, 1, 2]
    .filter((candidate) => faceDistances[candidate] <= tolerance)
    .filter((candidate) => [0, 1, 2].every((other) => other === candidate || overlaps[other] > 0))
    .sort((a, b) => faceDistances[a] - faceDistances[b] || a - b)[0];
  if (axis === undefined) return undefined;
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = directionAwayFromCursor(target, cursor, axis);
  return { normal, separation: gaps[axis] };
}

function translatedBounds(bounds: SpatialBounds, x: number, z: number): SpatialBounds {
  return {
    minX: bounds.minX + x, maxX: bounds.maxX + x,
    minY: bounds.minY, maxY: bounds.maxY,
    minZ: bounds.minZ + z, maxZ: bounds.maxZ + z,
  };
}

export function evaluateInteractions(
  nodes: readonly SpatialNode[],
  tolerance = 0.001,
  coordinateSpace?: CoordinateSpaceDimensions,
): InteractionFact[] {
  const cursors = nodes.filter((node) => node.origin?.sourceKind === 'secondary');
  const targets = nodes.filter((node) => node.origin?.sourceKind !== 'secondary');
  const index = new AabbInteractionIndex(targets);
  return cursors.flatMap((cursor): InteractionFact[] => {
    const xOffsets = coordinateSpace ? [-coordinateSpace.width, 0, coordinateSpace.width] : [0];
    const zOffsets = coordinateSpace ? [-coordinateSpace.depth, 0, coordinateSpace.depth] : [0];
    const candidates = xOffsets.flatMap((x) => zOffsets.map((z) => translatedBounds(cursor.bounds, x, z)))
      .flatMap((bounds) => index.query(bounds, tolerance).map((target) => ({ target, cursorBounds: bounds })));
    const closestByTarget = new Map<string, typeof candidates[number]>();
    candidates.forEach((candidate) => {
      const current = closestByTarget.get(candidate.target.id);
      const distance = Math.hypot(...center(candidate.cursorBounds).map((value, axis) => value - center(candidate.target.bounds)[axis]));
      const currentDistance = current
        ? Math.hypot(...center(current.cursorBounds).map((value, axis) => value - center(current.target.bounds)[axis]))
        : Number.POSITIVE_INFINITY;
      if (distance < currentDistance) closestByTarget.set(candidate.target.id, candidate);
    });
    return [...closestByTarget.values()].flatMap(({ target, cursorBounds }): InteractionFact[] => {
    const common = {
      targetId: target.id,
      targetNamespace: target.namespacePath ?? '',
      cursorId: cursor.id,
      cursorNamespace: cursor.namespacePath ?? cursor.id,
      streamId: cursor.origin?.streamId ?? cursor.origin?.publicKey ?? 'secondary',
      transactionId: cursor.origin?.transactionId,
      transactionTime: cursor.origin?.transactionTime,
      cursorWeight: cursor.origin?.transactionAmount,
      inferredDirection: ([0, 1, 2].map((axis) => directionAwayFromCursor(target.bounds, cursorBounds, axis)) as [number, number, number]),
    };
    if (boundsOverlap(target.bounds, cursorBounds)) {
      return [{ ...common, state: 'breach' as const, ...breachDetails(target.bounds, cursorBounds) }];
    }
    const probe = probeDetails(target.bounds, cursorBounds, tolerance);
    return probe ? [{ ...common, state: 'probe' as const, ...probe }] : [];
    });
  });
}
