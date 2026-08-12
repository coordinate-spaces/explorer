import type { SpatialBounds } from '../model/SpatialNode';

export type Vector3Tuple = [number, number, number];

export interface SecondaryCameraTarget {
  streamId: string;
  cursorNamespace: string;
}

export interface SecondaryCameraSample {
  target: SecondaryCameraTarget;
  position: Vector3Tuple;
}

export interface SecondaryCameraMotion {
  heading: Vector3Tuple;
  snap: boolean;
}

export interface SecondaryCameraSnapshot {
  heading: Vector3Tuple;
  discontinuity: number;
}

export function secondaryCameraTargetKey(target: SecondaryCameraTarget): string {
  return `${target.streamId}\u0000${target.cursorNamespace}`;
}

function distance(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function normalized(vector: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector);
  return length > 0
    ? vector.map((component) => component / length) as Vector3Tuple
    : [1, 0, 0];
}

/**
 * Finds the forward intersection of a ray starting at the center of an
 * axis-aligned world-space bounds, then advances it by `safetyMargin`.
 *
 * A zero vector uses the camera's positive-X fallback. Zero-size axes are
 * valid: when the ray points through one, the exit distance is zero.
 */
export function forwardBoundsExit(
  bounds: SpatialBounds,
  normalizedHeading: Vector3Tuple,
  safetyMargin = 0,
): Vector3Tuple {
  const minimums = [bounds.minX, bounds.minY, bounds.minZ];
  const maximums = [bounds.maxX, bounds.maxY, bounds.maxZ];
  const center = minimums.map((minimum, axis) => (minimum + maximums[axis]) / 2) as Vector3Tuple;
  const heading = normalized(normalizedHeading);
  const distances = heading.map((component, axis) => component === 0
    ? Number.POSITIVE_INFINITY
    : Math.max(0, (maximums[axis] - minimums[axis]) / 2) / Math.abs(component));
  const exitDistance = Math.min(...distances);
  const distanceWithMargin = (Number.isFinite(exitDistance) ? exitDistance : 0) + Math.max(0, safetyMargin);

  return center.map((component, axis) => component + heading[axis] * distanceWithMargin) as Vector3Tuple;
}

/** Keeps a smoothed point outside bounds while preserving unaffected axes. */
export function constrainPointOutsideBounds(
  point: Vector3Tuple,
  bounds: SpatialBounds,
  safePoint: Vector3Tuple,
): Vector3Tuple {
  const minimums = [bounds.minX, bounds.minY, bounds.minZ];
  const maximums = [bounds.maxX, bounds.maxY, bounds.maxZ];
  const isInside = point.every((component, axis) => component >= minimums[axis] && component <= maximums[axis]);
  if (!isInside) return [...point];

  const escapeAxis = safePoint.findIndex((component, axis) => (
    component < minimums[axis] || component > maximums[axis]
  ));
  if (escapeAxis < 0) return [...safePoint];

  const constrained = [...point] as Vector3Tuple;
  constrained[escapeAxis] = safePoint[escapeAxis];
  return constrained;
}

/** Retains movement history independently for every secondary cursor. */
export class SecondaryCameraMotionTracker {
  private positions = new Map<string, Vector3Tuple>();
  private headings = new Map<string, Vector3Tuple>();
  private discontinuities = new Map<string, number>();

  update(target: SecondaryCameraTarget, position: Vector3Tuple, discontinuityThreshold = 12): SecondaryCameraMotion {
    const key = secondaryCameraTargetKey(target);
    const previous = this.positions.get(key);
    const movement = previous
      ? position.map((component, axis) => component - previous[axis]) as Vector3Tuple
      : undefined;
    const movementDistance = previous ? distance(position, previous) : 0;
    const existingHeading = this.headings.get(key);
    const heading = movementDistance > Number.EPSILON
      ? normalized(movement as Vector3Tuple)
      : existingHeading ?? [1, 0, 0];

    this.positions.set(key, [...position]);
    this.headings.set(key, heading);
    if (previous && movementDistance > discontinuityThreshold) {
      this.discontinuities.set(key, (this.discontinuities.get(key) ?? 0) + 1);
    }
    return { heading, snap: !previous || movementDistance > discontinuityThreshold };
  }

  heading(target: SecondaryCameraTarget): Vector3Tuple {
    return this.headings.get(secondaryCameraTargetKey(target)) ?? [1, 0, 0];
  }

  snapshot(target: SecondaryCameraTarget): SecondaryCameraSnapshot {
    const key = secondaryCameraTargetKey(target);
    return {
      heading: this.headings.get(key) ?? [1, 0, 0],
      discontinuity: this.discontinuities.get(key) ?? 0,
    };
  }
}
