import { useObservedMeasure } from '@/lib/useObservedMeasure';
import { useState, type RefObject } from 'react';

export const RING_ROOM_ATTR = 'data-ring-room';

export function ringMaxWidth(chrome: number): string {
  const px = `${Math.round(chrome)}px`;
  return `max(20rem, min(48rem, calc(100dvh - 24rem), calc(var(--ring-room, 100dvh) - ${px} - 0.75rem)))`;
}

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
