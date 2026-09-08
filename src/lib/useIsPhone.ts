import { useEffect, useState } from 'react';

/**
 * The `sm` breakpoint, written as a *max*-width for the reason
 * `useIsNarrow.ts` sets out at length: `vitest.setup.ts` stubs `matchMedia` to
 * never match, so a `min-width` query would read as "phone" under test and
 * flip the Overview board into its folded shape in every existing test at
 * once. Phrased this way the same non-matching stub reads as "not a phone",
 * which is the layout those tests query. Do not "simplify" this to
 * `min-width`.
 */
export const PHONE_QUERY = '(max-width: 39.999rem)';

/**
 * True below `sm`, where the Overview board stops being a two-column grid.
 *
 * A third breakpoint hook rather than a reuse of `useIsNarrow`, which is the
 * `md` threshold (48rem). The two answer different questions: `useIsNarrow`
 * asks whether a filter row of selects costs more than the list it filters,
 * and the board asks whether its cards still fit side by side. Folding the
 * board at `useIsNarrow`'s width would collapse four cards into a list at
 * 700px, where the grid is happily showing two columns of them.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}
