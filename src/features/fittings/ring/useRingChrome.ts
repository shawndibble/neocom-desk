import { useObservedMeasure } from '@/lib/useObservedMeasure';
import { useState, type RefObject } from 'react';

/**
 * The column the Ring fits (the open Fitting's sticky editor column) carries
 * this attribute, and from the desktop breakpoint sets `--ring-room` to the
 * height it pins at.
 */
export const RING_ROOM_ATTR = 'data-ring-room';

/**
 * The ring grows with its column up to 48rem, where a tile is 48/648 of it —
 * about 57px — but never past the window less 24rem (header, tabs, panel header
 * and the readouts), so on first load the readouts end inside the viewport. In
 * a column that sets `--ring-room` it is also never past that room less
 * `chrome` (px: the tabs and panel header above the ring, the readouts under
 * it): once the column pins, the readouts stay on screen whatever sits above
 * the page. Legend and cargo may scroll. A short window (a landscape phone)
 * keeps at least 20rem.
 */
export function ringMaxWidth(chrome: number): string {
  const px = `${Math.round(chrome)}px`;
  return `max(20rem, min(48rem, calc(100dvh - 24rem), calc(var(--ring-room, 100dvh) - ${px} - 0.75rem)))`;
}

/**
 * The px `ringMaxWidth` leaves for the rest of the column: how far the ring
 * sits below the top of its `RING_ROOM_ATTR` column, plus the readouts under
 * it. Re-measured as the readouts, the column or anything in it resizes (a
 * wrapping panel header moves the ring without resizing a pinned column),
 * never on scroll; 0 outside such a column or without readouts.
 */
export function useRingChrome(
  readouts: RefObject<HTMLDivElement | null>,
  ring: RefObject<HTMLDivElement | null>
): number {
  const [chrome, setChrome] = useState(0);
  const column = () => ring.current?.closest<HTMLElement>(`[${RING_ROOM_ATTR}]`);
  useObservedMeasure(
    () => {
      const readoutsEl = readouts.current;
      const columnEl = column();
      if (!readoutsEl || !ring.current || !columnEl) return null;
      return [readoutsEl, columnEl, ...columnEl.children];
    },
    () => {
      const readoutsEl = readouts.current;
      const ringEl = ring.current;
      const columnEl = column();
      if (!readoutsEl || !ringEl || !columnEl) return;
      const ringBox = ringEl.getBoundingClientRect();
      const above = ringBox.top - columnEl.getBoundingClientRect().top + columnEl.scrollTop;
      const below = readoutsEl.getBoundingClientRect().bottom - ringBox.bottom;
      const next = Math.round(above + below);
      setChrome((prev) => (prev === next ? prev : next));
    },
    [readouts, ring],
    { layout: true }
  );
  return chrome;
}
