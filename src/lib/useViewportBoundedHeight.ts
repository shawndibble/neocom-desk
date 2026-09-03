import { useCallback, useEffect, useState } from 'react';

/** Shared breathing room below a viewport-bounded panel, so it doesn't sit flush against the window edge. */
export const VIEWPORT_BOUNDED_BOTTOM_GAP_PX = 24;

/**
 * Live-measured `max-height` (px) so a capped, internally-scrolling panel
 * fills whatever room is actually left below it in the viewport, instead of
 * a hand-derived constant (the list/detail panes used a flat `32rem`) that's
 * wrong for most viewport heights and content amounts — the same lesson the
 * plan editor learned the hard way from a hand-derived sticky offset.
 *
 * Returns a callback ref rather than accepting a `useRef` object: the
 * measured element is typically behind a loading gate (the plan/build-plan
 * data isn't ready on first mount), so a plain `useRef` + `useEffect` would
 * capture `null` on that first pass and never retry once the real element
 * mounts later — a callback ref re-fires this hook's effect the moment the
 * node actually attaches.
 *
 * Re-measures on window resize and whenever the page's overall layout
 * changes size (a banner appearing above the panel, content loading in,
 * etc.) via a `ResizeObserver` on `document.body` — the target element's own
 * size can't tell us that its *position* moved.
 */
export function useViewportBoundedHeight(
  bottomGapPx: number
): [(node: HTMLElement | null) => void, number | null] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;

    const measure = () => {
      const top = node.getBoundingClientRect().top;
      const available = window.innerHeight - top - bottomGapPx;
      // jsdom (unit tests) has no real viewport, so `innerHeight` can be
      // absent/non-finite there — skip rather than commit a NaN height.
      if (!Number.isFinite(available)) return;
      setHeight(Math.max(available, 0));
    };

    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [node, bottomGapPx]);

  return [ref, height];
}
