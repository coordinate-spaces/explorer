import { Edges, RoundedBoxGeometry } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, Vector3 } from 'three';
import type { SpatialCursorDraft } from '../cursor/spatialCursor';

interface SpatialCursorProps {
  cursor: SpatialCursorDraft;
  onChange: (cursor: SpatialCursorDraft) => void;
}

const keys = new Set<string>();

function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function PreviewGeometry({ cursor }: { cursor: SpatialCursorDraft }) {
  if (cursor.geometry === 'sphere') return <sphereGeometry args={[0.5, 32, 16]} />;
  if (cursor.geometry === 'cylinder') return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
  if (cursor.geometry === 'cone') return <coneGeometry args={[0.5, 1, 32]} />;
  if (cursor.boxRadius > 0) return <RoundedBoxGeometry args={[1, 1, 1]} radius={cursor.boxRadius} smoothness={6} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

export function SpatialCursor({ cursor, onChange }: SpatialCursorProps) {
  const cursorRef = useRef(cursor);
  const onChangeRef = useRef(onChange);
  cursorRef.current = cursor;
  onChangeRef.current = onChange;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!cursorRef.current.enabled || isFormTarget(event.target)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        keys.add(event.code);
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    const clear = () => keys.clear();
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement === null || !cursorRef.current.enabled) return;
      const current = cursorRef.current;
      const pitchDirection = current.invertMouseY ? 1 : -1;
      onChangeRef.current({
        ...current,
        rotation: [
          current.rotation[0] + event.movementY * current.mouseSensitivity * pitchDirection,
          current.rotation[1] - event.movementX * current.mouseSensitivity,
          current.rotation[2],
        ],
      });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('mousemove', mouse);
    document.addEventListener('visibilitychange', clear);
    return () => {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mousemove', mouse);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  useFrame((_, rawDelta) => {
    const current = cursorRef.current;
    if (!current.enabled || keys.size === 0) return;
    const delta = Math.min(rawDelta, 0.05);
    const direction = new Vector3(
      Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
      Number(keys.has('KeyE')) - Number(keys.has('KeyQ')),
      Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    );
    if (direction.lengthSq() === 0) return;
    const precision = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.15 : 1;
    direction.normalize().multiplyScalar(current.movementSpeed * precision * delta);
    if (current.coordinateSpace === 'local') direction.applyEuler(new Euler(...current.rotation, 'XYZ'));
    onChangeRef.current({
      ...current,
      position: current.position.map((value, index) => Math.max(0, value + direction.getComponent(index))) as [number, number, number],
    });
  });

  if (!cursor.previewVisible) return null;
  const center = cursor.position.map((value, index) => value + cursor.dimensions[index] / 2) as [number, number, number];
  return (
    <group position={center} rotation={cursor.rotation}>
      <mesh scale={cursor.dimensions} raycast={() => null}>
        <PreviewGeometry cursor={cursor} />
        <meshStandardMaterial color={cursor.color} metalness={cursor.metalness} roughness={cursor.roughness} transparent opacity={0.38} depthWrite={false} />
        <Edges color="#38bdf8" />
      </mesh>
      <axesHelper args={[Math.max(...cursor.dimensions, 0.15)]} raycast={() => null} />
    </group>
  );
}
