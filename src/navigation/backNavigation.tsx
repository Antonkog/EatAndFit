import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

type BackHandler = { priority: number; order: number; run: () => void };
type Gesture = { startX: number; startY: number; endX: number; endY: number; elapsedMs: number; viewportWidth: number };

const BackNavigationContext = createContext<((handler: () => void, priority: number) => () => void) | null>(null);

export function isEdgeBackSwipe({ startX, startY, endX, endY, elapsedMs, viewportWidth }: Gesture) {
  const edgeWidth = Math.min(32, Math.max(22, viewportWidth * 0.075));
  const horizontal = endX - startX;
  const vertical = Math.abs(endY - startY);
  return startX <= edgeWidth
    && horizontal >= 72
    && horizontal >= vertical * 1.35
    && elapsedMs <= 1_000;
}

export function BackNavigationProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<symbol, BackHandler>());
  const order = useRef(0);
  const gesture = useRef<{ x: number; y: number; startedAt: number } | undefined>(undefined);

  const register = useCallback((run: () => void, priority: number) => {
    const id = Symbol('back-handler');
    handlers.current.set(id, { priority, order: ++order.current, run });
    return () => handlers.current.delete(id);
  }, []);

  useEffect(() => {
    const topHandler = () => [...handlers.current.values()].sort((left, right) => right.priority - left.priority || right.order - left.order)[0];
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !topHandler()) return;
      const touch = event.touches[0];
      const edgeWidth = Math.min(32, Math.max(22, window.innerWidth * 0.075));
      gesture.current = touch.clientX <= edgeWidth ? { x: touch.clientX, y: touch.clientY, startedAt: performance.now() } : undefined;
    };
    const onMove = (event: TouchEvent) => {
      const start = gesture.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      const horizontal = touch.clientX - start.x;
      const vertical = Math.abs(touch.clientY - start.y);
      if (horizontal > 14 && horizontal > vertical * 1.2) event.preventDefault();
    };
    const onEnd = (event: TouchEvent) => {
      const start = gesture.current;
      gesture.current = undefined;
      const touch = event.changedTouches[0];
      if (!start || !touch || !isEdgeBackSwipe({
        startX: start.x,
        startY: start.y,
        endX: touch.clientX,
        endY: touch.clientY,
        elapsedMs: performance.now() - start.startedAt,
        viewportWidth: window.innerWidth,
      })) return;
      topHandler()?.run();
    };
    const cancel = () => { gesture.current = undefined; };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', cancel);
    };
  }, []);

  return <BackNavigationContext.Provider value={register}>{children}</BackNavigationContext.Provider>;
}

export function useBackNavigation(enabled: boolean, onBack: () => void, priority = 0) {
  const register = useContext(BackNavigationContext);
  const handler = useRef(onBack);
  handler.current = onBack;
  useEffect(() => {
    if (!enabled || !register) return;
    return register(() => handler.current(), priority);
  }, [enabled, priority, register]);
}
