import { cx } from '@/lib/cx';

/**
 * The class string of a borderless, uppercase accent text action — a "Clear
 * day", "Dismiss all", "Use detected" control that sits in a header or a row
 * and acts (or navigates) without drawing a `Button` box around itself.
 *
 * Its own module, and a class helper rather than a component, for the same
 * reason as `buttonClassName`: the one recipe has to land on a `<button>` and
 * on a `react-router-dom` `Link` alike. `extra` carries the per-site
 * differences (`gap-1` for a trailing icon, `justify-end`, `whitespace-nowrap`)
 * — there is deliberately no variant prop.
 *
 * `min-h-11` is the 44px touch tier below `md` (DESIGN.md §3); the `md:min-h-0`
 * lets the text height stand on a pointer.
 */
export function textActionClassName(extra = ''): string {
  return cx(
    'flex min-h-11 items-center rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0',
    extra
  );
}
