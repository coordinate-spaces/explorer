export type Vector3Tuple = [number, number, number];

export interface SecondaryCameraTarget {
  streamId: string;
  cursorNamespace: string;
}

export interface SecondaryCameraMotion {
  heading: Vector3Tuple;
  snap: boolean;
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

/** Retains movement history independently for every secondary cursor. */
export class SecondaryCameraMotionTracker {
  private positions = new Map<string, Vector3Tuple>();
  private headings = new Map<string, Vector3Tuple>();

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
    return { heading, snap: !previous || movementDistance > discontinuityThreshold };
  }
}
