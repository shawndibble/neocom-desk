import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/** Distance past which a release dismisses, in px. */
export const SWIPE_DISMISS_DISTANCE = 80;
/** Release speed past which a short swipe still dismisses, in px/ms. */
export const SWIPE_DISMISS_VELOCITY = 0.5;
/** Movement before a press counts as a drag, so a tap on the ✕ still clicks. */
const DRAG_SLOP = 4;

/** A release this long after the last move ignores velocity. */
const VELOCITY_WINDOW_MS = 100;

/** How long a released sheet takes to slide off the bottom before it closes. */
const DISMISS_SLIDE_MS = 240;

/** After the close, how long before a sheet its parent kept open slides back. */
const KEPT_OPEN_CHECK_MS = 300;

function applyOffset(el: HTMLElement | null, px: number, animate: boolean, reduced: boolean) {
  if (!el) return;
  el.style.transition = animate && !reduced ? 'transform 240ms var(--motion-ease-out)' : 'none';
  el.style.transform = px === 0 ? '' : `translateY(${px}px)`;
}

/** Sends a released sheet off the bottom edge. */
function slideOff(el: HTMLElement | null) {
  if (!el) return;
  el.style.transition = `transform ${DISMISS_SLIDE_MS}ms var(--motion-ease-in)`;
  el.style.transform = 'translateY(100%)';
}

/**
 * Swipe-down-to-dismiss for a bottom sheet (docs/DESIGN.md §6c). Spread the
 * returned handlers on the drag zone (the grabber and header, never the
 * scrolled body); the `target` element follows the finger, then either slides
 * off the bottom and goes (`onDismiss`) or snaps back. Under reduced motion it
 * goes, or snaps back, at once. Each `open` starts the sheet back in place.
 */
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

  // Layout effect: runs before `Modal`'s `showModal()`, so a sheet a swipe
  // left off screen never opens there.
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
      // A flick that was then held still is not a flick: only a recent sample counts.
      const velocity = performance.now() - g.lastT > VELOCITY_WINDOW_MS ? 0 : g.velocity;
      if (dy >= SWIPE_DISMISS_DISTANCE || (dy > DRAG_SLOP && velocity >= SWIPE_DISMISS_VELOCITY)) {
        if (reduced) {
          setOffset(0, false);
          onDismiss();
          return;
        }
        // Finish the gesture: off the bottom, then close. Closing first would
        // hide the dialog (`display: none`) before the slide could be seen.
        const sheet = target.current;
        const stillOpen = () => sheet?.isConnected === true && sheet.hasAttribute('open');
        slideOff(sheet);
        later(() => {
          // Escape, Back or a backdrop tap during the slide already closed
          // it: a second close could run a parent's navigate(-1) twice.
          if (!stillOpen()) return;
          onDismiss();
          // A parent may keep the sheet open (it asks to confirm first):
          // bring it back rather than leave it parked off screen.
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
