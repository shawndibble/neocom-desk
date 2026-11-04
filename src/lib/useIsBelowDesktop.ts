import { useMediaQuery } from './useMediaQuery';

/**
 * The width below the `lg` breakpoint, written as a *max*-width for the reason
 * `NARROW_QUERY` is: `vitest.setup.ts` stubs `matchMedia` to never match, so a
 * `min-width` query would read as "narrow" in every test. Phrased this way the
 * non-matching stub reads as a full desktop width, which is what route tests
 * query. Do not "simplify" this to `min-width`.
 */
export const BELOW_DESKTOP_QUERY = '(max-width: 63.999rem)';

/** True between `md` and `lg` (and below): too little room for a filter row's inline controls beside a search box and its buttons. */
export function useIsBelowDesktop(): boolean {
  return useMediaQuery(BELOW_DESKTOP_QUERY);
}
