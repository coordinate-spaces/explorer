import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { LocalCursorState } from './localCursor';
import type { XyzDslGeometryKind } from '../xyzdsl/types';

interface Props {
  cursor: LocalCursorState;
  size: [number, number, number];
  color: string;
  geometry: XyzDslGeometryKind;
  onPositionChange: (position: [number, number, number]) => void;
}

const EDITABLE = 'input, textarea, select, button, [contenteditable="true"]';

export function LocalSpatialCursor({ cursor, size, color, geometry, onPositionChange }: Props) {
  const keys = useRef(new Set<string>());
  const position = useRef(cursor.position);
  const { camera } = useThree();

  useEffect(() => { position.current = cursor.position; }, [cursor.position]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest?.(EDITABLE)) return;
      keys.current.add(event.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  useFrame((_, delta) => {
    const speed = Math.min(delta, 0.05) * (keys.current.has('ShiftLeft') ? 2 : 8);
    const dx = (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0);
    const dy = (keys.current.has('KeyE') ? 1 : 0) - (keys.current.has('KeyQ') ? 1 : 0);
    const dz = (keys.current.has('KeyS') ? 1 : 0) - (keys.current.has('KeyW') ? 1 : 0);
    if (dx || dy || dz) {
      const unitScale = cursor.unit === 'm' ? 1 : cursor.unit === 'dm' ? 0.1 : cursor.unit === 'cm' ? 0.01 : 0.001;
      position.current = position.current.map((value, index) => Math.max(0, value + [dx, dy, dz][index] * speed * unitScale)) as [number, number, number];
      onPositionChange(position.current);
    }
    if (cursor.pov) {
      camera.position.set(...position.current);
      camera.rotation.set(...cursor.rotation);
    }
  });

  return (
    <group position={cursor.position} rotation={cursor.rotation}>
      <mesh position={[size[0] / 2, size[1] / 2, size[2] / 2]}>
        {geometry === 'sphere' ? <sphereGeometry args={[Math.max(...size) / 2, 24, 16]} /> : null}
        {geometry === 'cylinder' ? <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 24]} /> : null}
        {geometry === 'cone' ? <coneGeometry args={[size[0] / 2, size[1], 24]} /> : null}
        {geometry === 'box' ? <boxGeometry args={size} /> : null}
        <meshStandardMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <axesHelper args={[Math.max(0.12, ...size)]} />
      <mesh><sphereGeometry args={[0.012, 12, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
    </group>
  );
}
