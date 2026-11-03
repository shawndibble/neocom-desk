import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Clearance kept between the element's bottom edge and the viewport's. */
const CLEARANCE_PX = 12;

/**
 * Keeps a sticky, viewport-tall element ending at the viewport's bottom
 * (0.75rem clear) wherever its top is. A fixed `100dvh` height would push its
 * bottom off the screen until the page scrolled, because at the top of the
 * page the element starts below the header and filters above it.
 *
 * Returns the ref to put on the element. `property` is what is set: `height`
 * for a column that always fills, `maxHeight` for one that should shrink to
 * short content. While `active` is false the inline style is cleared, so the
 * caller's own classes apply (a fallback height, say). Measures before paint,
 * on scroll, on resize and when the page's content changes height.
 */
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
    // Content above it changing height (a charge note, load warnings) moves its top too.
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
