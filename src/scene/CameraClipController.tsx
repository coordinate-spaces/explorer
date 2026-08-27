import { useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { updateCameraClipPlanes } from './cameraScale';

interface CameraClipControllerProps {
  nodes: readonly SpatialNode[];
  scale: number;
}

export function CameraClipController({ nodes, scale }: CameraClipControllerProps) {
  useFrame(({ camera }) => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return;
    updateCameraClipPlanes(camera as PerspectiveCamera, scale, nodes);
  });

  return null;
}
