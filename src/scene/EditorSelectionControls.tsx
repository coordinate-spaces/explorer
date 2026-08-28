import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { AxisName } from '../xyzdsl/types';

interface EditorSelectionControlsProps {
  active: boolean;
  canEditSelection: boolean;
  linearStep: number;
  rotationStep: number;
  onMove: (axis: AxisName, delta: number) => void;
  onResize: (axis: AxisName, delta: number) => void;
  onRotate: (axis: AxisName, delta: number) => void;
  onCreate: (position: [number, number, number]) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName));
}

function hasSpatialNode(object: { parent: unknown; userData: Record<string, unknown> } | null): boolean {
  let current = object;
  while (current) {
    if (current.userData.spatialNodeId) return true;
    current = current.parent as typeof current;
  }
  return false;
}

export function EditorSelectionControls({ active, canEditSelection, linearStep, rotationStep, onMove, onResize, onRotate, onCreate }: EditorSelectionControlsProps) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;

    const keyDown = (event: KeyboardEvent) => {
      if (!canEditSelection || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const movement: Partial<Record<string, [AxisName, number]>> = {
        a: ['x', -linearStep], d: ['x', linearStep], q: ['y', -linearStep], e: ['y', linearStep],
        w: ['z', -linearStep], s: ['z', linearStep],
      };
      const move = movement[key];
      if (move && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onMove(...move);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault();
        const delta = event.key === '-' ? -linearStep : linearStep;
        (['x', 'y', 'z'] as AxisName[]).forEach((axis) => onResize(axis, delta));
      }
    };

    const wheel = (event: WheelEvent) => {
      if (!canEditSelection || isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (Math.abs(event.deltaX) > 0.01) onRotate('y', Math.sign(event.deltaX) * rotationStep);
      if (Math.abs(event.deltaY) > 0.01) onRotate('x', Math.sign(event.deltaY) * rotationStep);
    };

    const doubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pointer = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const spatialHit = raycaster.intersectObjects(scene.children, true).some(({ object }) => hasSpatialNode(object));
      if (spatialHit) return;
      const point = new Vector3();
      if (raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), point)) {
        event.preventDefault();
        onCreate(point.toArray());
      }
    };

    window.addEventListener('keydown', keyDown);
    canvas.addEventListener('wheel', wheel, { passive: false, capture: true });
    canvas.addEventListener('dblclick', doubleClick);
    return () => {
      window.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('wheel', wheel, true);
      canvas.removeEventListener('dblclick', doubleClick);
    };
  }, [active, camera, canEditSelection, gl, linearStep, onCreate, onMove, onResize, onRotate, raycaster, rotationStep, scene]);

  return null;
}
