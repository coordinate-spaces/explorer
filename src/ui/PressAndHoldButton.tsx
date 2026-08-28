import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';

interface PressAndHoldButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onActivate: () => void;
}

export function PressAndHoldButton({ onActivate, onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onKeyDown, onKeyUp, ...props }: PressAndHoldButtonProps) {
  const delayTimer = useRef<number | undefined>(undefined);
  const repeatTimer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);

  const stop = () => {
    window.clearTimeout(delayTimer.current);
    window.clearInterval(repeatTimer.current);
    delayTimer.current = undefined;
    repeatTimer.current = undefined;
  };

  const start = () => {
    if (props.disabled) return;
    stop();
    suppressClick.current = true;
    onActivate();
    delayTimer.current = window.setTimeout(() => {
      repeatTimer.current = window.setInterval(onActivate, 75);
    }, 350);
  };

  useEffect(() => stop, []);

  return <button
    {...props}
    type={props.type ?? 'button'}
    onPointerDown={(event) => {
      if (event.button === 0) {
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }
      onPointerDown?.(event);
    }}
    onPointerUp={(event) => { stop(); onPointerUp?.(event); }}
    onPointerCancel={(event) => { stop(); onPointerCancel?.(event); }}
    onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) stop(); onPointerLeave?.(event); }}
    onKeyDown={(event) => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) start(); onKeyDown?.(event); }}
    onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') stop(); onKeyUp?.(event); }}
    onBlur={stop}
    onClick={(event) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
      } else onActivate();
    }}
  />;
}
