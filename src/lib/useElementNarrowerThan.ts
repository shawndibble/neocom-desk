import { useEffect, useMemo, useState } from 'react';

export function useElementNarrowerThan<T extends HTMLElement>(
  rems: readonly number[]
): [ref: (element: T | null) => void, narrower: readonly boolean[]] {
  const [element, setElement] = useState<T | null>(null);
  const [mask, setMask] = useState(0);
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
  const narrower = useMemo(
    () => key.split(',').map((_, i) => element !== null && (mask & (1 << i)) !== 0),
    [key, element, mask]
  );
  return [setElement, narrower];
}
