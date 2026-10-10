import { useEffect, type RefObject } from 'react';

/** Extra room so the focus ring clears the bar too. */
const FOCUS_RING_MARGIN = '0.75rem';

/**
 * A bar pinned over the bottom of the viewport reserves the space it covers
 * (its height plus its bottom offset) as `--<name>-clearance` on the root, so
 * a focused control scrolls clear of it (WCAG 2.4.11). `index.css` sums every
 * bar's term into `scroll-padding-bottom`; never set that inline here, it
 * would overwrite the other bars' terms. Removed on unmount or when disabled.
 */
export function useStickyClearance(
  ref: RefObject<HTMLElement | null>,
  name: string,
  { enabled = true }: { enabled?: boolean } = {}
): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const property = `--${name}-clearance`;
    const rootStyle = document.documentElement.style;
    const publish = () => {
      const covered = Math.max(0, window.innerHeight - el.getBoundingClientRect().top);
      rootStyle.setProperty(property, `calc(${covered}px + ${FOCUS_RING_MARGIN})`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    // The bottom offset can change with the viewport, not just the element.
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      rootStyle.removeProperty(property);
    };
  }, [ref, name, enabled]);
}
