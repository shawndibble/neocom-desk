import { useLayoutEffect, useRef, type RefObject } from 'react';

const CLEARANCE_PX = 12;

export function useFitToViewport<T extends HTMLElement>(
  active: boolean,
  property: 'height' | 'maxHeight' = 'height'
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const top = Math.max(el.getBoundingClientRect().top, CLEARANCE_PX);
      el.style[property] = `${window.innerHeight - top - CLEARANCE_PX}px`;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    resized?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resized?.disconnect();
      el.style[property] = '';
    };
  }, [active, property]);
  return ref;
}
