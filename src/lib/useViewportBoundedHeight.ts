import { useCallback, useEffect, useState } from 'react';

export const VIEWPORT_BOUNDED_BOTTOM_GAP_PX = 24;

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
