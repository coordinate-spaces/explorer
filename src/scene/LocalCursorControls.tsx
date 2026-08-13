import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { LocalCursorInput } from '../simulation/localCursor';

interface LocalCursorControlsProps {
  enabled: boolean;
  onCaptureChange: (captured: boolean) => void;
  onInput: (input: LocalCursorInput) => void;
}

const TICK_SECONDS = 1 / 30;
const MOUSE_DEGREES_PER_PIXEL = 0.12;

export function LocalCursorControls({ enabled, onCaptureChange, onInput }: LocalCursorControlsProps) {
  const element = useThree((state) => state.gl.domElement);
  const keys = useRef(new Set<string>());
  const mouse = useRef<[number, number]>([0, 0]);
  const elapsed = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const editable = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const keydown = (event: KeyboardEvent) => {
      if (!editable(event.target)) keys.current.add(event.code);
    };
    const keyup = (event: KeyboardEvent) => keys.current.delete(event.code);
    const mousemove = (event: MouseEvent) => {
      if (document.pointerLockElement === element) {
        mouse.current[0] += event.movementX;
        mouse.current[1] += event.movementY;
      }
    };
    const capture = () => onCaptureChange(document.pointerLockElement === element);
    const clear = () => keys.current.clear();
    const click = () => element.requestPointerLock();
    element.addEventListener('click', click);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('mousemove', mousemove);
    window.addEventListener('blur', clear);
    document.addEventListener('pointerlockchange', capture);
    return () => {
      element.removeEventListener('click', click);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('mousemove', mousemove);
      window.removeEventListener('blur', clear);
      document.removeEventListener('pointerlockchange', capture);
      keys.current.clear();
      if (document.pointerLockElement === element) document.exitPointerLock();
      onCaptureChange(false);
    };
  }, [element, enabled, onCaptureChange]);

  useFrame((_, delta) => {
    if (!enabled) return;
    elapsed.current += Math.min(delta, 0.1);
    if (elapsed.current < TICK_SECONDS) return;
    const held = keys.current;
    const [mouseX, mouseY] = mouse.current;
    mouse.current = [0, 0];
    const deltaSeconds = elapsed.current;
    elapsed.current = 0;
    if (!mouseX && !mouseY && held.size === 0) return;
    onInput({
      forward: Number(held.has('KeyW')) - Number(held.has('KeyS')),
      right: Number(held.has('KeyD')) - Number(held.has('KeyA')),
      up: Number(held.has('Space') || held.has('KeyE')) - Number(held.has('ShiftLeft') || held.has('ShiftRight') || held.has('KeyQ')),
      yawDelta: mouseX * MOUSE_DEGREES_PER_PIXEL,
      pitchDelta: -mouseY * MOUSE_DEGREES_PER_PIXEL,
      deltaSeconds,
    });
  });
  return null;
}
