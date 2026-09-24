import { useEffect, useRef, type TouchEventHandler } from "react";

export function useTextLongPress(open: () => void, disabled: boolean) {
  const gesture = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);

  function cancel() {
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
  }

  useEffect(() => {
    if (disabled && gesture.current) {
      clearTimeout(gesture.current.timer);
      gesture.current = null;
    }
    return () => {
      if (gesture.current) clearTimeout(gesture.current.timer);
      gesture.current = null;
    };
  }, [disabled]);

  const onTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    cancel();
    if (
      disabled ||
      event.touches.length !== 1 ||
      (event.target as Element).closest("a, button, input, textarea, summary")
    )
      return;
    const { clientX: x, clientY: y } = event.touches[0];
    gesture.current = {
      x,
      y,
      timer: setTimeout(() => {
        gesture.current = null;
        open();
      }, 500),
    };
  };

  const onTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.touches[0];
    if (
      gesture.current &&
      (event.touches.length !== 1 ||
        Math.hypot(touch.clientX - gesture.current.x, touch.clientY - gesture.current.y) > 10)
    )
      cancel();
  };

  return { onTouchStart, onTouchMove, onTouchEnd: cancel, onTouchCancel: cancel };
}
