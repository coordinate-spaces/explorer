import { Box3, Object3D, Vector3 } from 'three';
import type { XyzDslModelAlign, XyzDslModelFit } from '../xyzdsl/types';

export interface ModelFitTransform {
  position: [number, number, number];
  scale: [number, number, number];
}

export function modelFitTransform(object: Object3D, fit: XyzDslModelFit, align: XyzDslModelAlign): ModelFitTransform {
  object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error('The model contains no renderable geometry.');
  const size = bounds.getSize(new Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) throw new Error('The model has zero-size bounds.');

  const scale = fit === 'stretch'
    ? [1 / size.x, 1 / size.y, 1 / size.z] as [number, number, number]
    : Array(3).fill(1 / Math.max(size.x, size.y, size.z)) as [number, number, number];
  const center = bounds.getCenter(new Vector3());
  const negate = (value: number) => value === 0 ? 0 : -value;
  const y = align === 'floor' ? -bounds.min.y - 0.5 / scale[1] : negate(center.y);
  return { position: [negate(center.x), y, negate(center.z)], scale };
}
