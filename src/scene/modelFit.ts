import { Box3, Object3D, Vector3 } from 'three';
import type { XyzDslModelAlign, XyzDslModelFit } from '../xyzdsl/types';

export interface ModelFitTransform {
  position: [number, number, number];
  scale: [number, number, number];
}

export function modelFitTransformFromBounds(
  bounds: Box3,
  fit: XyzDslModelFit,
  align: XyzDslModelAlign,
  targetScale: readonly [number, number, number] = [1, 1, 1],
): ModelFitTransform {
  if (bounds.isEmpty()) throw new Error('The model contains no renderable geometry.');
  const size = bounds.getSize(new Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  if (largestDimension <= 0 || (fit === 'stretch' && (size.x <= 0 || size.y <= 0 || size.z <= 0))) {
    throw new Error(fit === 'stretch' ? 'Stretch fitting requires nonzero bounds on every axis.' : 'The model has zero-size bounds.');
  }

  if (targetScale.some((dimension) => dimension <= 0)) throw new Error('Model target bounds must be greater than zero.');
  const scale = fit === 'stretch'
    ? [1 / size.x, 1 / size.y, 1 / size.z] as [number, number, number]
    : (() => {
        const worldScale = Math.min(targetScale[0] / size.x || Infinity, targetScale[1] / size.y || Infinity, targetScale[2] / size.z || Infinity);
        return targetScale.map((dimension) => worldScale / dimension) as [number, number, number];
      })();
  const center = bounds.getCenter(new Vector3());
  const negate = (value: number) => value === 0 ? 0 : -value;
  const y = align === 'floor' ? -bounds.min.y - 0.5 / scale[1] : negate(center.y);
  return { position: [negate(center.x), y, negate(center.z)], scale };
}

export function modelFitTransform(
  object: Object3D,
  fit: XyzDslModelFit,
  align: XyzDslModelAlign,
  targetScale: readonly [number, number, number] = [1, 1, 1],
): ModelFitTransform {
  object.updateWorldMatrix(true, true);
  return modelFitTransformFromBounds(new Box3().setFromObject(object), fit, align, targetScale);
}
