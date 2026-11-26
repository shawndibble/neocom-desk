import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export const SWIPE_DISMISS_DISTANCE = 80;
export const SWIPE_DISMISS_VELOCITY = 0.5;
export const DRAG_SLOP = 4;

const VELOCITY_WINDOW_MS = 100;

export const DISMISS_SLIDE_MS = 240;

const KEPT_OPEN_CHECK_MS = 300;

function applyOffset(el: HTMLElement | null, px: number, animate: boolean, reduced: boolean) {
  if (!el) return;
  el.style.transition =
    animate && !reduced ? 'transform var(--motion-slow-exit) var(--motion-ease-out)' : 'none';
  el.style.transform = px === 0 ? '' : `translateY(${px}px)`;
}

function slideOff(el: HTMLElement | null) {
  if (!el) return;
  el.style.transition = 'transform var(--motion-slow-exit) var(--motion-ease-in)';
  el.style.transform = 'translateY(100%)';
}

export function useSheetSwipe(
  target: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean,
  open: boolean
) {
  const gesture = useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const reduced = usePrefersReducedMotion();
  const setOffset = (px: number, animate: boolean) =>
    applyOffset(target.current, px, animate, reduced);

  useLayoutEffect(() => {
    if (open && enabled) applyOffset(target.current, 0, false, true);
  }, [open, enabled, target]);

  const timer = useRef<number | undefined>(undefined);
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!enabled) return {};

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gesture.current = {
        startY: event.clientY,
        lastY: event.clientY,
        lastT: performance.now(),
        velocity: 0,
        dragging: false,
        pointerId: event.pointerId,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g) return;
      const dy = event.clientY - g.startY;
      if (!g.dragging) {
        if (dy < DRAG_SLOP) return;
        g.dragging = true;
        event.currentTarget.setPointerCapture?.(g.pointerId);
      }
      const dt = performance.now() - g.lastT;
      if (dt > 0) g.velocity = (event.clientY - g.lastY) / dt;
      g.lastY = event.clientY;
      g.lastT = performance.now();
      setOffset(Math.max(0, dy), false);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      gesture.current = null;
      if (!g?.dragging) return;
      const dy = Math.max(0, event.clientY - g.startY);
      const velocity = performance.now() - g.lastT > VELOCITY_WINDOW_MS ? 0 : g.velocity;
      if (dy >= SWIPE_DISMISS_DISTANCE || (dy > DRAG_SLOP && velocity >= SWIPE_DISMISS_VELOCITY)) {
        if (reduced) {
          setOffset(0, false);
          onDismiss();
          return;
        }
        const sheet = target.current;
        const stillOpen = () => sheet?.isConnected === true && sheet.hasAttribute('open');
        slideOff(sheet);
        later(() => {
          if (!stillOpen()) return;
          onDismiss();
          later(() => {
            if (stillOpen()) applyOffset(sheet, 0, true, false);
          }, KEPT_OPEN_CHECK_MS);
        }, DISMISS_SLIDE_MS);
      } else {
        setOffset(0, true);
      }
    },
    onPointerCancel() {
      if (gesture.current?.dragging) setOffset(0, true);
      gesture.current = null;
    },
  };
}
