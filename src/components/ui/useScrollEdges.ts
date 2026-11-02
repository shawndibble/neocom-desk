import { useCallback, useEffect, useState, type RefObject } from 'react';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { pageScrollDelta, scrollEdges, type ScrollEdges } from './tabScroll';

/**
 * Which ends of a sideways scroller still have content past them, and a pager
 * for the edge chevrons (`Tabs`, the PI Map board). Recomputed on scroll and
 * on any resize of the scroller or of `contentRef` (content growing, a window
 * resize), so callers need no dependency on their items.
 */
export function useScrollEdges(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef?: RefObject<HTMLElement | null>
) {
  const reducedMotion = usePrefersReducedMotion();
  const [edges, setEdges] = useState<ScrollEdges>({ before: false, after: false });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const next = scrollEdges(scroller);
      setEdges((prev) => (prev.before === next.before && prev.after === next.after ? prev : next));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    if (contentRef?.current) observer?.observe(contentRef.current);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [scrollerRef, contentRef]);

  const pageScroll = useCallback(
    (direction: 'before' | 'after') => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollBy({
        left: pageScrollDelta(direction, scroller.clientWidth),
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [scrollerRef, reducedMotion]
  );

  return { edges, pageScroll };
}
