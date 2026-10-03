import { useEffect, useMemo, useState } from 'react';

/**
 * For each width in `rems`, whether an element is narrower than it — a
 * container query for what CSS cannot switch: a value chosen in JS, like a
 * number's format (one DOM at every width, DESIGN.md) or whether a
 * `DataTable` shows cards. Pair a width with a `@container` query at the same
 * value where CSS changes with it.
 *
 * Re-renders only when the element crosses one of the widths, not on every
 * pixel of a resize. Returns a callback ref, so it follows an element that
 * mounts late (a table shown once its data loads). Without `ResizeObserver`
 * (jsdom) every answer is "not narrower": the wide layout the tests query.
 */
export function useElementNarrowerThan<T extends HTMLElement>(
  rems: readonly number[]
): [ref: (element: T | null) => void, narrower: readonly boolean[]] {
  const [element, setElement] = useState<T | null>(null);
  // Bit i set: narrower than rems[i]. A number, so an unchanged answer is an
  // unchanged state and React skips the re-render.
  const [mask, setMask] = useState(0);
  // A caller's inline array is a new one every render; its values are what count.
  const key = rems.join(',');
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const widths = key.split(',').map(Number);
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const px = entry.contentRect.width;
      setMask(widths.reduce((bits, rem, i) => (px < rem * rootPx ? bits | (1 << i) : bits), 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, key]);
  // No element reads as wide, so a table that remounts starts wide rather
  // than with the width its last mount ended on.
  const narrower = useMemo(
    () => key.split(',').map((_, i) => element !== null && (mask & (1 << i)) !== 0),
    [key, element, mask]
  );
  return [setElement, narrower];
}
