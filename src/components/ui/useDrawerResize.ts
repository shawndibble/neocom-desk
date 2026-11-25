import { clamp } from '@/engine/math';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DISMISS_SLIDE_MS, DRAG_SLOP, SWIPE_DISMISS_DISTANCE } from './useSheetSwipe';

interface DrawerResizeOptions {
  /** Shortest the drawer may be drawn, in px. Pulling below it dismisses instead. */
  min: number;
  /** Height it opens at, clamped to the ceiling before the first paint. */
  initial: number;
  /** One arrow-key press of height, in px. */
  step: number;
  /** Share of the viewport the ceiling sits at (0.8 = 80vh). */
  maxFraction: number;
  /** A pull of `SWIPE_DISMISS_DISTANCE` past `min`, once the slide has run. */
  onDismiss: () => void;
  /** False while the drawer is closed, or drawn as a full-screen sheet with no grip. */
  enabled: boolean;
}

export interface DrawerResize {
  /** Current height in px — for the box, and for the grip's `aria-valuenow`. */
  height: number;
  /** The ceiling right now — for the grip's `aria-valuemax`. */
  max: number;
  /** Spread on every drag zone: the grip, and the header above the body. */
  dragProps: {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(): void;
  };
  /** On the grip: the drag's keyboard equivalents. */
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
  /** Inline style for the drawer box — height, the drag's travel, and its motion. */
  style: CSSProperties;
}

/**
 * Drag a bottom drawer's grip: up and down sets any height between `min` and a
 * viewport-derived ceiling, and carrying the pull past `min` slides the drawer
 * off the bottom edge and dismisses it. One gesture for "shorter" and "away",
 * which is what lets a resizable drawer drop its Expand button
 * (`docs/context/decisions/20261125-211649-compare-drawer-is-dragged-to-size-with-no`).
 *
 * The sibling of `useSheetSwipe` (which dismisses a `<dialog>` sheet and has no
 * notion of a height) and `useRowSwipe`, and it follows their pointer pattern
 * rather than a fourth copy of it: pointer capture plus React handlers, so
 * there are no `window` listeners to leak; the shared `DRAG_SLOP` activation
 * distance, so a press that barely moves still reaches whatever it was on
 * (DESIGN.md §6c "Drag"); and a `pointercancel` path, so a gesture the browser
 * takes away cannot leave the drawer parked mid-drag.
 *
 * It owns no DOM. The caller spreads `dragProps` on its drag zones and `style`
 * on the box, which keeps the hook testable and lets a drawer have more than
 * one drag zone — the grip the keyboard uses, and the header, so that
 * "drag the drawer" means the thing the reader is actually pointing at.
 *
 * What it deliberately does not take from `useSheetSwipe`: a velocity test. A
 * flick is a thumb gesture on a sheet that only ever dismisses; here a fast
 * drag is usually someone resizing in a hurry, and dismissing on it would
 * throw away the Compare Set on the way to a taller drawer.
 */
export function useDrawerResize({
  min,
  initial,
  step,
  maxFraction,
  onDismiss,
  enabled,
}: DrawerResizeOptions): DrawerResize {
  const reduced = usePrefersReducedMotion();

  // Viewport-derived rather than a fixed pixel ceiling: a fixed one either
  // stops short of a tall monitor or, in a short window, lets the drawer cover
  // the handle that closes it.
  const ceiling = useCallback(() => {
    if (typeof window === 'undefined') return min;
    return Math.max(min, Math.round(window.innerHeight * maxFraction));
  }, [min, maxFraction]);

  const [max, setMax] = useState(ceiling);
  // Clamped at birth, not only on resize: in a window shorter than
  // `initial / maxFraction` the drawer would otherwise open taller than its own
  // ceiling, with `aria-valuenow` above `aria-valuemax`.
  const [height, setHeight] = useState(() => clamp(initial, min, ceiling()));
  /** Pixels the drag has pulled the drawer below `min` — it travels instead of shrinking. */
  const [overpullPx, setOverpullPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** The committed pull is sliding the drawer off the edge; `onDismiss` follows. */
  const [leaving, setLeaving] = useState(false);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // The ceiling follows the viewport, and a window shrunk under the current
  // height brings the drawer down with it rather than leaving it off screen.
  useEffect(() => {
    const onResize = () => {
      const next = ceiling();
      setMax(next);
      setHeight((current) => clamp(current, min, next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ceiling, min]);

  const slide = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(slide.current), []);

  /**
   * Finish the gesture: send the drawer the rest of the way off the bottom
   * edge, then dismiss. Closing first would unmount the box before the slide
   * could be seen. Reduced motion dismisses at once.
   */
  const commit = useCallback(() => {
    if (reduced) {
      setOverpullPx(0);
      onDismissRef.current();
      return;
    }
    setLeaving(true);
    setOverpullPx(min);
    slide.current = window.setTimeout(() => {
      setLeaving(false);
      setOverpullPx(0);
      onDismissRef.current();
    }, DISMISS_SLIDE_MS);
  }, [min, reduced]);

  const gesture = useRef<{
    startY: number;
    startHeight: number;
    max: number;
    overpull: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const end = (dismiss: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.dragging) return;
    setDragging(false);
    if (dismiss && g.overpull >= SWIPE_DISMISS_DISTANCE) commit();
    else setOverpullPx(0);
  };

  const dragProps: DrawerResize['dragProps'] = {
    onPointerDown(event) {
      if (!enabled || leaving) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gesture.current = {
        startY: event.clientY,
        startHeight: height,
        max,
        overpull: 0,
        dragging: false,
        pointerId: event.pointerId,
      };
    },
    onPointerMove(event) {
      const g = gesture.current;
      if (!g) return;
      const dy = event.clientY - g.startY;
      if (!g.dragging) {
        // Either direction: a press on the header that barely moves is still a
        // press on whatever control it landed on.
        if (Math.abs(dy) < DRAG_SLOP) return;
        g.dragging = true;
        event.currentTarget.setPointerCapture?.(g.pointerId);
        setDragging(true);
      }
      const raw = g.startHeight - dy;
      g.overpull = Math.max(0, min - raw);
      setHeight(clamp(raw, min, g.max));
      setOverpullPx(g.overpull);
    },
    onPointerUp() {
      end(true);
    },
    onPointerCancel() {
      end(false);
    },
  };

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!enabled) return;
    const resize = (next: number) => {
      event.preventDefault();
      setHeight(clamp(next, min, max));
    };
    // ArrowDown at `min` stops there: the pointer's "pull past the floor to
    // dismiss" has no keyboard twin, because Escape and the close button are
    // already it, and a key that closed on one extra press would surprise.
    if (event.key === 'ArrowUp') resize(height + step);
    else if (event.key === 'ArrowDown') resize(height - step);
    else if (event.key === 'Home') resize(min);
    else if (event.key === 'End') resize(max);
  }

  return {
    height,
    max,
    dragProps,
    onKeyDown,
    style: {
      height,
      transform: overpullPx > 0 ? `translateY(${overpullPx}px)` : undefined,
      // Follows the pointer with no transition while the grip is held. The
      // snap back decelerates and the committed slide accelerates away, per
      // §6c's entering/leaving easings; reduced motion takes neither.
      transition:
        dragging || reduced
          ? 'none'
          : leaving
            ? 'transform var(--motion-slow-exit) var(--motion-ease-in)'
            : 'transform var(--motion-slow-exit) var(--motion-ease-out)',
    },
  };
}
