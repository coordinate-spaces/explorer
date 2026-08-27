import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, MathUtils, Raycaster, Vector2 } from 'three';
import { spatialNodeIdForPovRaycast } from './povPicking';
import { worldAlignedPovMovement } from './povNavigation';

interface PovControlsProps {
  active: boolean;
  collision: boolean;
  speed: number;
  onLockChange: (locked: boolean) => void;
  onSelectNode?: (id: string | undefined) => void;
}

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName));
}

export function PovControls({ active, collision, speed, onLockChange, onSelectNode }: PovControlsProps) {
  const { camera, gl, scene } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const selectionRaycaster = useRef(new Raycaster());
  const collisionRaycaster = useRef(new Raycaster());

  useEffect(() => {
    if (!active) {
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
      onLockChange(false);
      return;
    }
    const syncAnglesFromCamera = () => {
      const euler = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      yaw.current = euler.y;
      pitch.current = euler.x;
    };
    syncAnglesFromCamera();
    const lockChange = () => {
      const locked = document.pointerLockElement === gl.domElement;
      if (locked) syncAnglesFromCamera();
      else keys.current.clear();
      onLockChange(locked);
    };
    const keyDown = (event: KeyboardEvent) => { if (!editableTarget(event.target)) keys.current.add(event.code); };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const keyUpAll = () => keys.current.clear();
    const mouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.002;
      pitch.current = MathUtils.clamp(pitch.current - event.movementY * 0.002, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    };
    const pointerDown = (event: PointerEvent) => {
      if (document.pointerLockElement !== gl.domElement) {
        if (event.button === 0) gl.domElement.requestPointerLock();
        return;
      }
      if (event.button === 0) {
        selectionRaycaster.current.setFromCamera(new Vector2(0, 0), camera);
        const hit = selectionRaycaster.current.intersectObjects(scene.children, true)
          .map(({ object }) => spatialNodeIdForPovRaycast(object))
          .find((id) => id !== undefined);
        onSelectNode?.(hit);
      }
    };
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', keyUp);
    document.addEventListener('mousemove', mouseMove);
    window.addEventListener('blur', keyUpAll);
    gl.domElement.addEventListener('pointerdown', pointerDown);
    return () => {
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
      document.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('blur', keyUpAll);
      gl.domElement.removeEventListener('pointerdown', pointerDown);
      keys.current.clear();
    };
  }, [active, camera, gl, onLockChange, onSelectNode, scene]);

  useFrame((_, frameDelta) => {
    if (!active || document.pointerLockElement !== gl.domElement) return;
    const delta = Math.min(frameDelta, 0.05);
    const precision = keys.current.has('KeyZ');
    const boost = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight');
    const distance = speed * delta * (precision ? 0.1 : boost ? 4 : 1);
    const movement = worldAlignedPovMovement({
      right: Number(keys.current.has('KeyD') || keys.current.has('ArrowRight')) - Number(keys.current.has('KeyA') || keys.current.has('ArrowLeft')),
      up: Number(keys.current.has('KeyE') || keys.current.has('Space')) - Number(keys.current.has('KeyQ')),
      backward: Number(keys.current.has('KeyS') || keys.current.has('ArrowDown')) - Number(keys.current.has('KeyW') || keys.current.has('ArrowUp')),
    }, yaw.current, distance);
    if (!movement.lengthSq()) return;
    if (collision) {
      collisionRaycaster.current.set(camera.position, movement.clone().normalize());
      collisionRaycaster.current.far = Math.max(movement.length() + speed * 0.08, speed * 0.12);
      const blocked = collisionRaycaster.current.intersectObjects(scene.children, true)
        .some(({ object }) => spatialNodeIdForPovRaycast(object) !== undefined);
      if (blocked) return;
    }
    camera.position.add(movement);
  });

  return null;
}
