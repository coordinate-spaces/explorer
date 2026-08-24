import { useEffect } from 'react';
import type { CursorPose } from './useSpatialCursorControls';
import { useSpatialCursorControls } from './useSpatialCursorControls';

interface SpatialCursorProps {
  pose: CursorPose; enabled: boolean; linearSensitivity?: number; angularSensitivity?: number;
  onPreview: (pose: CursorPose) => void; onCommit: (pose: CursorPose) => void; onCancel: () => void;
  onMouseCaptureChange?: (captured: boolean) => void;
}

export function SpatialCursor({ pose, enabled, linearSensitivity = 0.6, angularSensitivity = 0.005, onPreview, onCommit, onCancel, onMouseCaptureChange }: SpatialCursorProps) {
  const { mouseCaptured } = useSpatialCursorControls({ pose, enabled, linearSensitivity, angularSensitivity, onPreview, onCommit, onCancel });
  useEffect(() => onMouseCaptureChange?.(mouseCaptured), [mouseCaptured, onMouseCaptureChange]);
  const noRaycast = () => null;
  const axes: Array<{ position: [number, number, number]; color: string }> = [
    { position: [0.13, 0, 0], color: '#ff4057' },
    { position: [0, 0.13, 0], color: '#43e07d' },
    { position: [0, 0, 0.13], color: '#42a5ff' },
  ];
  return (
    <group position={pose.position} rotation={pose.rotation} visible={enabled} name="local-spatial-cursor">
      <mesh raycast={noRaycast}><sphereGeometry args={[0.035, 12, 8]} /><meshBasicMaterial color="#ffffff" depthTest={false} /></mesh>
      {axes.map((axis, index) => (
        <mesh key={axis.color} position={axis.position} rotation={index === 0 ? [0, 0, -Math.PI / 2] : index === 2 ? [Math.PI / 2, 0, 0] : undefined} raycast={noRaycast}>
          <cylinderGeometry args={[0.008, 0.008, 0.22, 8]} /><meshBasicMaterial color={axis.color} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}
