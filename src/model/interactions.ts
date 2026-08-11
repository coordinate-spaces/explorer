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
  /** Per-axis direction away from the cursor, used when an interaction normal is zero. */
  inferredDirection: [number, number, number];
  penetration?: number;
  /** Minimum target translation required to separate a breached AABB. */
  resolutionDistance?: number;
  separation?: number;
  cursorWeight?: number;
}

export interface SpatialInteractionIndex {
  query(bounds: SpatialBounds, tolerance?: number): SpatialNode[];
  update(node: SpatialNode): void;
  remove(nodeId: string): void;
}

export interface InteractionNarrowPhase {
  evaluate(target: SpatialNode, cursorBounds: SpatialBounds, tolerance: number):
    | Pick<InteractionFact, 'state' | 'normal' | 'inferredDirection' | 'penetration' | 'resolutionDistance' | 'separation'>
    | undefined;
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

  private oversized = new Set<string>();

  constructor(nodes: readonly SpatialNode[] = [], private readonly cellSize = 10, private readonly maximumCellsPerNode = 4_096) {
    nodes.forEach((node) => this.update(node));
  }

  private keys(bounds: SpatialBounds): string[] {
    const counts = [
      Math.floor(bounds.maxX / this.cellSize) - Math.floor(bounds.minX / this.cellSize) + 1,
      Math.floor(bounds.maxY / this.cellSize) - Math.floor(bounds.minY / this.cellSize) + 1,
      Math.floor(bounds.maxZ / this.cellSize) - Math.floor(bounds.minZ / this.cellSize) + 1,
    ];
    if (counts.some((count) => !Number.isFinite(count) || count <= 0) || counts.reduce((total, count) => total * count, 1) > this.maximumCellsPerNode) return [];
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
    const keys = this.keys(queryBounds);
    const candidateIds = new Set([
      ...keys.flatMap((key) => [...(this.cells.get(key) ?? [])]),
      ...this.oversized,
      ...(keys.length === 0 ? this.nodes.keys() : []),
    ]);
    return [...candidateIds].flatMap((id) => this.nodes.get(id) ?? [])
      .filter((node) => boundsOverlap(queryBounds, expanded(node.bounds, Number.EPSILON)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  update(node: SpatialNode): void {
    this.remove(node.id);
    this.nodes.set(node.id, node);
    const keys = this.keys(node.bounds);
    if (keys.length === 0) this.oversized.add(node.id);
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
    this.oversized.delete(nodeId);
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

function breachDetails(target: SpatialBounds, cursor: SpatialBounds): Pick<InteractionFact, 'normal' | 'penetration' | 'resolutionDistance'> {
  const overlaps = [
    Math.min(target.maxX, cursor.maxX) - Math.max(target.minX, cursor.minX),
    Math.min(target.maxY, cursor.maxY) - Math.max(target.minY, cursor.minY),
    Math.min(target.maxZ, cursor.maxZ) - Math.max(target.minZ, cursor.minZ),
  ];
  const targetMinimums = [target.minX, target.minY, target.minZ];
  const targetMaximums = [target.maxX, target.maxY, target.maxZ];
  const cursorMinimums = [cursor.minX, cursor.minY, cursor.minZ];
  const cursorMaximums = [cursor.maxX, cursor.maxY, cursor.maxZ];
  const exits = [0, 1, 2].flatMap((axis) => [
    { axis, direction: -1, distance: targetMaximums[axis] - cursorMinimums[axis] },
    { axis, direction: 1, distance: cursorMaximums[axis] - targetMinimums[axis] },
  ]).sort((a, b) => a.distance - b.distance || a.axis - b.axis || a.direction - b.direction);
  const exit = exits[0];
  const normal: [number, number, number] = [0, 0, 0];
  normal[exit.axis] = exit.direction;
  return {
    normal,
    penetration: overlaps[exit.axis],
    resolutionDistance: exit.distance,
  };
}

function touchDetails(target: SpatialBounds, cursor: SpatialBounds, tolerance: number): Pick<InteractionFact, 'normal' | 'separation'> | undefined {
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

export class AabbInteractionNarrowPhase implements InteractionNarrowPhase {
  evaluate(target: SpatialNode, cursorBounds: SpatialBounds, tolerance: number) {
    const inferredDirection = ([0, 1, 2].map((axis) => directionAwayFromCursor(target.bounds, cursorBounds, axis)) as [number, number, number]);
    if (boundsOverlap(target.bounds, cursorBounds)) {
      return { state: 'breach' as const, inferredDirection, ...breachDetails(target.bounds, cursorBounds) };
    }
    const touch = touchDetails(target.bounds, cursorBounds, tolerance);
    return touch ? { state: 'touch' as const, inferredDirection, ...touch } : undefined;
  }
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
  suppliedIndex?: SpatialInteractionIndex,
  narrowPhase: InteractionNarrowPhase = new AabbInteractionNarrowPhase(),
): InteractionFact[] {
  const cursors = nodes.filter((node) => node.origin?.sourceKind === 'secondary');
  const targets = nodes.filter((node) => node.origin?.sourceKind !== 'secondary');
  const index = suppliedIndex ?? new AabbInteractionIndex(targets);
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
    };
    const interaction = narrowPhase.evaluate(target, cursorBounds, tolerance);
    return interaction ? [{ ...common, ...interaction }] : [];
    });
  });
}

/** Retains baseline proxies across cursor-only frames. */
export class InteractionWorld {
  readonly index: SpatialInteractionIndex;
  private targetIds = new Set<string>();

  constructor(index: SpatialInteractionIndex = new AabbInteractionIndex()) {
    this.index = index;
  }

  updateTargets(nodes: readonly SpatialNode[]): void {
    const next = new Set(nodes.map(({ id }) => id));
    [...this.targetIds].filter((id) => !next.has(id)).forEach((id) => this.index.remove(id));
    nodes.forEach((node) => this.index.update(node));
    this.targetIds = next;
  }

  evaluate(cursors: readonly SpatialNode[], tolerance = 0.001, coordinateSpace?: CoordinateSpaceDimensions): InteractionFact[] {
    return evaluateInteractions(cursors, tolerance, coordinateSpace, this.index);
  }
}
