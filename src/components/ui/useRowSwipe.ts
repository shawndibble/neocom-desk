import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export const ROW_SWIPE_DISMISS_DISTANCE = 80;
export const ROW_SWIPE_DISMISS_VELOCITY = 0.5;
export const ROW_SWIPE_ACTIVATE_DISTANCE = 10;
const MIN_FLICK_DISTANCE = 24;

const VELOCITY_WINDOW_MS = 100;

type Axis = 'x' | 'y';

function applyOffset(
  el: HTMLElement | null,
  transform: string,
  animate: boolean,
  reduced: boolean
) {
  if (!el) return;
  el.style.transition = animate && !reduced ? 'transform 200ms ease-out' : 'none';
  el.style.transform = transform;
}

function setTouchAction(el: HTMLElement, value: string) {
  el.style.touchAction = value;
}

function isRtl(el: HTMLElement): boolean {
  if (getComputedStyle(el).direction === 'rtl') return true;
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

export function useRowSwipe(
  target: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
) {
  const gesture = useRef<{
    startX: number;
    startY: number;
    dir: -1 | 1;
    axis: Axis | null;
    lastToward: number;
    lastT: number;
    velocity: number;
    pointerId: number;
  } | null>(null);
  const swallowClick = useRef(false);

  const reduced = usePrefersReducedMotion();
  const setOffset = (px: number, animate: boolean, dir: -1 | 1) =>
    applyOffset(target.current, px === 0 ? '' : `translateX(${dir * px}px)`, animate, reduced);

  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) return;
    setTouchAction(el, 'pan-y');
    return () => setTouchAction(el, '');
  }, [target, enabled]);

  if (!enabled) return {};

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse') return;
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (gesture.current) return;
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        dir: isRtl(event.currentTarget) ? 1 : -1,
        axis: null,
        lastToward: 0,
        lastT: performance.now(),
        velocity: 0,
        pointerId: event.pointerId,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId || g.axis === 'y') return;
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      const toward = dx * g.dir;
      if (!g.axis) {
        if (Math.abs(dy) >= ROW_SWIPE_ACTIVATE_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
          g.axis = 'y';
          return;
        }
        if (Math.abs(dx) < ROW_SWIPE_ACTIVATE_DISTANCE) return;
        g.axis = toward > 0 ? 'x' : 'y';
        if (g.axis === 'y') return;
        event.currentTarget.setPointerCapture?.(g.pointerId);
      }
      const now = performance.now();
      const dt = now - g.lastT;
      const width = event.currentTarget.offsetWidth;
      const travel = Math.max(0, width > 0 ? Math.min(toward, width) : toward);
      if (dt > 0) g.velocity = (travel - g.lastToward) / dt;
      g.lastToward = travel;
      g.lastT = now;
      setOffset(travel, false, g.dir);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g && g.pointerId !== event.pointerId) return;
      gesture.current = null;
      if (g?.axis !== 'x') return;
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 0);
      const velocity = performance.now() - g.lastT > VELOCITY_WINDOW_MS ? 0 : g.velocity;
      const travel = g.lastToward;
      if (
        travel >= ROW_SWIPE_DISMISS_DISTANCE ||
        (travel >= MIN_FLICK_DISTANCE && velocity >= ROW_SWIPE_DISMISS_VELOCITY)
      ) {
        if (reduced) applyOffset(target.current, '', false, true);
        else applyOffset(target.current, `translateX(${g.dir * 100}%)`, true, false);
        onDismiss();
      } else {
        setOffset(0, true, g.dir);
      }
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g && g.pointerId !== event.pointerId) return;
      gesture.current = null;
      if (g?.axis === 'x') setOffset(0, true, g.dir);
    },
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
