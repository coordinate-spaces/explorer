import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { SpatialTransform } from '../model/transform';

export type CursorPose = Pick<SpatialTransform, 'position' | 'rotation'>;

export const CURSOR_KEYS: Record<string, { axis: 0 | 1 | 2; direction: -1 | 1 }> = {
  KeyA: { axis: 0, direction: -1 }, KeyD: { axis: 0, direction: 1 },
  KeyQ: { axis: 1, direction: -1 }, KeyE: { axis: 1, direction: 1 },
  KeyS: { axis: 2, direction: -1 }, KeyW: { axis: 2, direction: 1 },
};

export function isEditableEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export interface SpatialCursorControlOptions {
  pose: CursorPose;
  enabled: boolean;
  linearSensitivity: number;
  angularSensitivity: number;
  onPreview: (pose: CursorPose) => void;
  onCommit: (pose: CursorPose) => void;
  onCancel: () => void;
}

export function useSpatialCursorControls(options: SpatialCursorControlOptions) {
  const { gl } = useThree();
  const latest = useRef(options);
  const pose = useRef<CursorPose>(options.pose);
  const pressed = useRef(new Set<string>());
  const dirty = useRef(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const [mouseCaptured, setMouseCaptured] = useState(false);
  latest.current = options;

  useEffect(() => { pose.current = options.pose; }, [options.pose]);
  const clearKeys = useCallback(() => { pressed.current.clear(); }, []);
  const commit = useCallback(() => {
    if (dirty.current) latest.current.onCommit(pose.current);
    dirty.current = false;
    clearKeys();
  }, [clearKeys]);

  useFrame((_, delta) => {
    if (!latest.current.enabled || pressed.current.size === 0) return;
    const position: CursorPose['position'] = [...pose.current.position];
    pressed.current.forEach((code) => {
      const binding = CURSOR_KEYS[code];
      if (binding) position[binding.axis] += binding.direction * latest.current.linearSensitivity * delta;
    });
    pose.current = { ...pose.current, position };
    dirty.current = true;
    latest.current.onPreview(pose.current);
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const stopCapture = (shouldCommit: boolean) => {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      setMouseCaptured(false);
      shouldCommit ? commit() : clearKeys();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!latest.current.enabled || isEditableEventTarget(event.target)) return;
      if (event.code === 'Escape') {
        event.preventDefault(); dirty.current = false; clearKeys(); setMouseCaptured(false); latest.current.onCancel(); return;
      }
      if (!CURSOR_KEYS[event.code] || event.repeat) return;
      event.preventDefault(); pressed.current.add(event.code);
      window.clearTimeout(idleTimer.current);
    };
    const keyup = (event: KeyboardEvent) => {
      if (!latest.current.enabled || !CURSOR_KEYS[event.code] || isEditableEventTarget(event.target)) return;
      event.preventDefault(); pressed.current.delete(event.code);
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(commit, 180);
    };
    const pointerdown = (event: PointerEvent) => {
      if (!latest.current.enabled || event.button !== 0 || isEditableEventTarget(event.target)) return;
      setMouseCaptured(true); canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    };
    const pointermove = (event: PointerEvent) => {
      if (!latest.current.enabled || !mouseCaptured) return;
      event.preventDefault();
      const rotation: CursorPose['rotation'] = [...pose.current.rotation];
      if (event.shiftKey) rotation[2] += event.movementX * latest.current.angularSensitivity;
      else { rotation[1] += event.movementX * latest.current.angularSensitivity; rotation[0] += event.movementY * latest.current.angularSensitivity; }
      pose.current = { ...pose.current, rotation }; dirty.current = true; latest.current.onPreview(pose.current);
    };
    const pointerup = (event: PointerEvent) => { if (mouseCaptured) { canvas.releasePointerCapture?.(event.pointerId); stopCapture(true); } };
    const blur = () => { clearKeys(); stopCapture(true); };
    const visibility = () => { if (document.hidden) blur(); };
    const lockchange = () => { if (document.pointerLockElement !== canvas && mouseCaptured) stopCapture(true); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    canvas.addEventListener('pointerdown', pointerdown); window.addEventListener('pointermove', pointermove); window.addEventListener('pointerup', pointerup);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerlockchange', lockchange);
    return () => {
      window.clearTimeout(idleTimer.current); clearKeys();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      canvas.removeEventListener('pointerdown', pointerdown); window.removeEventListener('pointermove', pointermove); window.removeEventListener('pointerup', pointerup);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerlockchange', lockchange);
    };
  }, [clearKeys, commit, gl, mouseCaptured]);

  useEffect(() => { if (!options.enabled) { clearKeys(); setMouseCaptured(false); } }, [clearKeys, options.enabled]);
  return { mouseCaptured, commit };
}
