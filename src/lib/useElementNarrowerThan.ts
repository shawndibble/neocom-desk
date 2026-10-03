import { useEffect, useState } from 'react';

/**
 * True while an element is narrower than `rem` — a container query for the
 * one thing CSS cannot switch: a value chosen in JS, like a number's format
 * (one DOM at every width, DESIGN.md). Pair it with a `@container` query at
 * the same width so the CSS and the JS change together.
 *
 * Returns a callback ref, so it follows an element that mounts late (a table
 * shown once its data loads). Without `ResizeObserver` (jsdom) it reads as
 * not narrower: the wide layout the tests query.
 */
export function useElementNarrowerThan<T extends HTMLElement>(
  rem: number
): [ref: (element: T | null) => void, narrower: boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [narrower, setNarrower] = useState(false);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrower(entry.contentRect.width < rem * rootPx);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, rem]);
  // No element reads as wide, so a table that remounts starts wide rather
  // than with the width its last mount ended on.
  return [setElement, element !== null && narrower];
}
