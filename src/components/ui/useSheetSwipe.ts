import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** Distance past which a release dismisses, in px. */
export const SWIPE_DISMISS_DISTANCE = 80;
/** Release speed past which a short swipe still dismisses, in px/ms. */
export const SWIPE_DISMISS_VELOCITY = 0.5;
/** Movement before a press counts as a drag, so a tap on the ✕ still clicks. */
const DRAG_SLOP = 4;

/** A release this long after the last move ignores velocity. */
const VELOCITY_WINDOW_MS = 100;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function applyOffset(el: HTMLElement | null, px: number, animate: boolean) {
  if (!el) return;
  const reduced = window.matchMedia(REDUCED_MOTION).matches;
  el.style.transition = animate && !reduced ? 'transform 200ms ease-out' : 'none';
  el.style.transform = px === 0 ? '' : `translateY(${px}px)`;
}

/**
 * Swipe-down-to-dismiss for a bottom sheet (docs/DESIGN.md §6c). Spread the
 * returned handlers on the drag zone (the grabber and header, never the
 * scrolled body); the `target` element follows the finger, then either goes
 * (`onDismiss`) or snaps back. Under reduced motion the snap is instant.
 */
export function useSheetSwipe(
  target: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
) {
  const gesture = useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const setOffset = (px: number, animate: boolean) => applyOffset(target.current, px, animate);

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
      // A flick that was then held still is not a flick: only a recent sample counts.
      const velocity = performance.now() - g.lastT > VELOCITY_WINDOW_MS ? 0 : g.velocity;
      if (dy >= SWIPE_DISMISS_DISTANCE || (dy > DRAG_SLOP && velocity >= SWIPE_DISMISS_VELOCITY)) {
        // The parent unmounts the dialog; clear the offset so the next open
        // starts in place.
        setOffset(0, false);
        onDismiss();
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
