import { useEffect, type RefObject } from 'react';

const FOCUS_RING_MARGIN = '0.75rem';

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
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      rootStyle.removeProperty(property);
    };
  }, [ref, name, enabled]);
}
