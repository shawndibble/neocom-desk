import { useEffect, useState } from 'react';

/**
 * The `md` breakpoint, written as a *max*-width rather than the `min-width:
 * 48rem` `Layout` and `useIsDesktop` use. The inversion is load-bearing, not a
 * style choice: `vitest.setup.ts` stubs `matchMedia` to never match, so a
 * `min-width` query reads as "narrow" under test and would flip every route
 * with a filter bar into its sheet branch at once. Phrased this way, the same
 * non-matching stub reads as "not narrow" — the inline row, which is what the
 * existing route tests query. Do not "simplify" this to `min-width`.
 */
export const NARROW_QUERY = '(max-width: 47.999rem)';

/**
 * True on a phone-width viewport, where a filter row of selects and chips costs
 * more screen than the list it filters (see `FilterBar`).
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isNarrow;
}
