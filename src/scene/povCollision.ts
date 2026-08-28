import { Box3, BufferGeometry, DoubleSide, InstancedMesh, Line3, Matrix4, Mesh, Ray, Triangle, Vector3, type Object3D } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { spatialNodeIdForPovCollision } from './povPicking';

const geometryBoundsTrees = new WeakMap<BufferGeometry, MeshBVH>();

function boundsTreeFor(geometry: BufferGeometry): MeshBVH {
  const cached = geometryBoundsTrees.get(geometry);
  if (cached) return cached;
  const tree = new MeshBVH(geometry);
  geometryBoundsTrees.set(geometry, tree);
  return tree;
}

function segmentSegmentDistanceSquared(first: Line3, second: Line3): number {
  const u = first.delta(new Vector3());
  const v = second.delta(new Vector3());
  const w = first.start.clone().sub(second.start);
  const a = u.dot(u);
  const b = u.dot(v);
  const c = v.dot(v);
  const d = u.dot(w);
  const e = v.dot(w);
  const denominator = a * c - b * b;
  let firstParameter = denominator > 1e-12 ? (b * e - c * d) / denominator : 0;
  firstParameter = Math.min(1, Math.max(0, firstParameter));
  let secondParameter = c > 1e-12 ? (b * firstParameter + e) / c : 0;
  secondParameter = Math.min(1, Math.max(0, secondParameter));
  if (a > 1e-12) firstParameter = Math.min(1, Math.max(0, (b * secondParameter - d) / a));
  const firstPoint = first.start.clone().addScaledVector(u, firstParameter);
  const secondPoint = second.start.clone().addScaledVector(v, secondParameter);
  return firstPoint.distanceToSquared(secondPoint);
}

function segmentTriangleDistanceSquared(segment: Line3, triangle: Triangle): number {
  const direction = segment.delta(new Vector3());
  const length = direction.length();
  if (length > 0) {
    const intersection = new Ray(segment.start, direction.normalize())
      .intersectTriangle(triangle.a, triangle.b, triangle.c, false, new Vector3());
    if (intersection && intersection.distanceTo(segment.start) <= length) return 0;
  }

  const closest = new Vector3();
  let distance = triangle.closestPointToPoint(segment.start, closest).distanceToSquared(segment.start);
  distance = Math.min(distance, triangle.closestPointToPoint(segment.end, closest).distanceToSquared(segment.end));
  const edges = [
    new Line3(triangle.a, triangle.b),
    new Line3(triangle.b, triangle.c),
    new Line3(triangle.c, triangle.a),
  ];
  edges.forEach((edge) => { distance = Math.min(distance, segmentSegmentDistanceSquared(segment, edge)); });
  return distance;
}

interface SweepMetrics {
  hit: boolean;
  startInside: boolean;
  endInside: boolean;
  startDistanceSquared: number;
  endDistanceSquared: number;
}

function pointInsideGeometry(tree: MeshBVH, point: Vector3): boolean {
  const direction = new Vector3(0.8123, 0.3371, 0.4759).normalize();
  const hits = tree.raycast(new Ray(point, direction), DoubleSide)
    .map(({ distance }) => distance)
    .sort((left, right) => left - right)
    .filter((distance, index, values) => index === 0 || Math.abs(distance - values[index - 1]) > 1e-7);
  return hits.length % 2 === 1;
}

function geometrySweepMetrics(
  geometry: BufferGeometry,
  matrixWorld: Matrix4,
  sweep: Line3,
  radius: number,
): SweepMetrics {
  const inverse = matrixWorld.clone().invert();
  const localStart = sweep.start.clone().applyMatrix4(inverse);
  const localEnd = sweep.end.clone().applyMatrix4(inverse);
  const localRadius = radius * inverse.getMaxScaleOnAxis();
  const localSweepBounds = new Box3().setFromPoints([localStart, localEnd]).expandByScalar(localRadius);
  const radiusSquared = radius * radius;
  const worldTriangle = new Triangle();
  const closest = new Vector3();
  const metrics: SweepMetrics = {
    hit: false,
    startInside: false,
    endInside: false,
    startDistanceSquared: Infinity,
    endDistanceSquared: Infinity,
  };
  const tree = boundsTreeFor(geometry);
  metrics.startInside = pointInsideGeometry(tree, localStart);
  metrics.endInside = pointInsideGeometry(tree, localEnd);

  tree.shapecast({
    intersectsBounds: (bounds) => bounds.intersectsBox(localSweepBounds),
    intersectsTriangle: (triangle) => {
      worldTriangle.a.copy(triangle.a).applyMatrix4(matrixWorld);
      worldTriangle.b.copy(triangle.b).applyMatrix4(matrixWorld);
      worldTriangle.c.copy(triangle.c).applyMatrix4(matrixWorld);
      metrics.startDistanceSquared = Math.min(
        metrics.startDistanceSquared,
        worldTriangle.closestPointToPoint(sweep.start, closest).distanceToSquared(sweep.start),
      );
      metrics.endDistanceSquared = Math.min(
        metrics.endDistanceSquared,
        worldTriangle.closestPointToPoint(sweep.end, closest).distanceToSquared(sweep.end),
      );
      if (segmentTriangleDistanceSquared(sweep, worldTriangle) <= radiusSquared) metrics.hit = true;
      return false;
    },
  });
  return metrics;
}

export function sweptSphereIntersectsScene(
  scene: Object3D,
  start: Vector3,
  end: Vector3,
  radius: number,
): boolean {
  const sweep = new Line3(start, end);
  let hit = false;
  let startInside = false;
  let endInside = false;
  let startDistanceSquared = Infinity;
  let endDistanceSquared = Infinity;
  scene.updateWorldMatrix(true, true);
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || !object.visible) return;
    if (spatialNodeIdForPovCollision(object) === undefined) return;
    const transforms: Matrix4[] = [];
    if (object instanceof InstancedMesh) {
      const instanceMatrix = new Matrix4();
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        transforms.push(object.matrixWorld.clone().multiply(instanceMatrix));
      }
    } else {
      transforms.push(object.matrixWorld);
    }
    transforms.forEach((matrixWorld) => {
      const metrics = geometrySweepMetrics(object.geometry, matrixWorld, sweep, radius);
      hit ||= metrics.hit;
      startInside ||= metrics.startInside;
      endInside ||= metrics.endInside;
      startDistanceSquared = Math.min(startDistanceSquared, metrics.startDistanceSquared);
      endDistanceSquared = Math.min(endDistanceSquared, metrics.endDistanceSquared);
    });
  });
  if (!hit) return false;
  const radiusSquared = radius * radius;
  const tolerance = Math.max(1e-12, radiusSquared * 1e-6);
  const escapingInterior = startInside && (!endInside || endDistanceSquared < startDistanceSquared - tolerance);
  const escapingOverlap = !startInside && startDistanceSquared <= radiusSquared
    && endDistanceSquared > startDistanceSquared + tolerance;
  return !(escapingInterior || escapingOverlap);
}
