import { useMediaQuery } from './useMediaQuery';

/** Matches the `lg:` breakpoint two-column layouts (Mail, Market, Skill Plans) switch on below. */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Narrow screens show one column at a time; tracking this in JS (rather than
 * relying on CSS alone) lets a route also gate which column receives focus/
 * back-control affordances at the same breakpoint the grid itself switches on.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
