import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/** Distance past which a release dismisses, in px. Same as the sheet's swipe. */
export const ROW_SWIPE_DISMISS_DISTANCE = 80;
/** Release speed past which a short swipe still dismisses, in px/ms. Same as the sheet's swipe. */
export const ROW_SWIPE_DISMISS_VELOCITY = 0.5;
/**
 * Sideways movement before a press becomes a swipe, in px. Above the browser's
 * own scroll slop (~10px), so a vertical scroll that wobbles sideways is
 * decided by its vertical travel first.
 */
export const ROW_SWIPE_ACTIVATE_DISTANCE = 10;
/** A flick shorter than this never dismisses, however fast: a twitch is not a decision. */
const MIN_FLICK_DISTANCE = 24;

/** A release this long after the last move ignores velocity. */
const VELOCITY_WINDOW_MS = 100;

/** Outcome of the first ROW_SWIPE_ACTIVATE_DISTANCE px: ours (`x`) or someone else's (`y`). */
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

/** Whether the element lays out right to left, so "inline start" is rightward. */
function isRtl(el: HTMLElement): boolean {
  if (getComputedStyle(el).direction === 'rtl') return true;
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

/**
 * Swipe-toward-the-inline-start-to-dismiss for a list row (docs/DESIGN.md §6c).
 * Spread the returned handlers on the row element that `target` points at; it
 * follows the finger, then either leaves (`onDismiss`) or springs back. The
 * dismiss track belongs at the inline end, underneath the row, and is the
 * caller's: this hook only moves the row.
 *
 * - One direction only. Toward the inline start (left in LTR, right in RTL)
 *   dismisses; the other way does nothing.
 * - Touch and pen only. A mouse never swipes: a visible dismiss control is the
 *   pointer path, and a drag would fight text selection and the row's click.
 * - Axis lock. The row claims `touch-action: pan-y` so the browser keeps
 *   vertical scrolling (and the sheet its own swipe-down). A press only becomes
 *   a swipe once it has travelled ROW_SWIPE_ACTIVATE_DISTANCE sideways without
 *   travelling further vertically; otherwise it is left alone for good.
 * - The click that ends a swipe is swallowed, so a swipe never also opens the row.
 * - On a dismiss the row slides the rest of the way out and `onDismiss` fires
 *   at once; the caller then unmounts it (collapse, Undo). Under reduced motion
 *   the row is handed over in place with no travel.
 * - `enabled = false` returns no handlers and claims no `touch-action`, so a
 *   row that must not swipe (a critical alert) is a parameter, not a branch.
 */
export function useRowSwipe(
  target: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
) {
  const gesture = useRef<{
    startX: number;
    startY: number;
    /** x direction of a dismiss: -1 toward the left (LTR), +1 toward the right (RTL). */
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
      // A menu or tooltip rendered through a portal is elsewhere in the DOM but
      // still inside this element's React tree, so its pointer events bubble
      // here. Dragging across an open menu item must not swipe the row away.
      if (!event.currentTarget.contains(event.target as Node)) return;
      // One finger owns the gesture; a second must not retarget it.
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
        // Wrong way: there is no swipe toward the inline end, so leave it be.
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
      // The click that follows a release lands in this same task.
      window.setTimeout(() => (swallowClick.current = false), 0);
      // A flick that was then held still is not a flick: only a recent sample counts.
      const velocity = performance.now() - g.lastT > VELOCITY_WINDOW_MS ? 0 : g.velocity;
      const travel = g.lastToward;
      if (
        travel >= ROW_SWIPE_DISMISS_DISTANCE ||
        (travel >= MIN_FLICK_DISTANCE && velocity >= ROW_SWIPE_DISMISS_VELOCITY)
      ) {
        // The caller unmounts the row. Under reduced motion it goes in place.
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
