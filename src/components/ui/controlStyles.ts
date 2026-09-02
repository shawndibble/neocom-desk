/**
 * The one control size scale, and the one field treatment.
 *
 * Every interactive control in the app — `Button`, `IconButton`, `FilterChip`,
 * `TextInput`, `NativeSelect`, `SelectTrigger` — sizes itself from
 * `controlHeightClassName` here, so a toolbar built from a single `size` value
 * lines up by construction rather than by whoever last eyeballed it. Before
 * this, fields were hand-written per call site and had drifted to `h-6`, `h-7`,
 * `h-8` and `h-9` all at once, which is why a `Select` sat visibly taller than
 * the `Button size="sm"` next to it.
 *
 * Internal — not re-exported from the barrel; callers reach it through the
 * components' `size` prop.
 */

export type ControlSize = 'sm' | 'md';

/**
 * Heights, per DESIGN.md §3: `h-7` compact / `h-9` default for a pointer, one
 * step up on a touch viewport so a thumb gets a 44px target. `IconButton`
 * shipped this tier first (`size-11 md:size-9`); it lives here now so the text
 * controls beside it match at *both* breakpoints instead of only on desktop.
 *
 * `StatChip` and `DataAgeBadge` deliberately stay at a flat `h-7` — they are
 * readouts, not targets, and growing them on a phone would only cost rows.
 */
export const controlHeightClassName: Record<ControlSize, string> = {
  sm: 'h-9 md:h-7',
  md: 'h-11 md:h-9',
};

/** Border, fill, text and focus ring. `bg-panel-2` is DESIGN.md §1's input fill. */
export const fieldBaseClassName =
  'rounded-xs border border-line bg-panel-2 text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40';

/** A field's horizontal padding and type scale, on top of the shared height. */
export const fieldSizeClassName: Record<ControlSize, string> = {
  sm: `${controlHeightClassName.sm} px-2 text-xs`,
  md: `${controlHeightClassName.md} px-3 text-sm`,
};
