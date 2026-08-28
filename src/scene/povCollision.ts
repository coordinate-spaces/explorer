import { Box3, BufferGeometry, Line3, Mesh, Ray, Triangle, Vector3, type Object3D } from 'three';
import { spatialNodeIdForPovCollision } from './povPicking';

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

function geometryIntersectsSweep(mesh: Mesh, sweep: Line3, radius: number): boolean {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position');
  if (!position) return false;
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const triangle = new Triangle(a, b, c);
  const radiusSquared = radius * radius;

  for (let offset = 0; offset + 2 < count; offset += 3) {
    a.fromBufferAttribute(position, index?.getX(offset) ?? offset).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, index?.getX(offset + 1) ?? offset + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, index?.getX(offset + 2) ?? offset + 2).applyMatrix4(mesh.matrixWorld);
    if (segmentTriangleDistanceSquared(sweep, triangle) <= radiusSquared) return true;
  }
  return false;
}

export function sweptSphereIntersectsScene(
  scene: Object3D,
  start: Vector3,
  end: Vector3,
  radius: number,
): boolean {
  const sweep = new Line3(start, end);
  const sweepBounds = new Box3().setFromPoints([start, end]).expandByScalar(radius);
  let blocked = false;
  scene.updateWorldMatrix(true, true);
  scene.traverse((object) => {
    if (blocked || !(object instanceof Mesh) || !object.visible) return;
    if (spatialNodeIdForPovCollision(object) === undefined) return;
    const objectBounds = new Box3().setFromObject(object);
    if (!sweepBounds.intersectsBox(objectBounds.expandByScalar(radius))) return;
    blocked = geometryIntersectsSweep(object, sweep, radius);
  });
  return blocked;
}
