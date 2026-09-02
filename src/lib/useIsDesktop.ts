import { useEffect, useState } from 'react';

/** Matches the `lg:` breakpoint two-column layouts (Mail, Market, Skill Plans) switch on below. */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Narrow screens show one column at a time; tracking this in JS (rather than
 * relying on CSS alone) lets a route also gate which column receives focus/
 * back-control affordances at the same breakpoint the grid itself switches on.
 */
export function useIsDesktop(query: string = DESKTOP_QUERY): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return isDesktop;
}
