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

/**
 * Border, fill, text and focus ring. `bg-panel-2` is DESIGN.md §1's input fill.
 * Border is `line-bright`, not `line` — `line` is only 1.35:1 against `panel-2`,
 * below the 3:1 floor for a visible resting edge (issue #1491). Placeholder is
 * `text-dim`, not `text-faint` — `text-faint` is below 4.5:1 and a placeholder
 * is the only visible prompt in some pickers.
 */
export const fieldBaseClassName =
  'rounded-xs border border-line-bright bg-panel-2 text-text placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40';

/** A field's horizontal padding and type scale, on top of the shared height. */
export const fieldSizeClassName: Record<ControlSize, string> = {
  sm: `${controlHeightClassName.sm} px-2 text-xs`,
  md: `${controlHeightClassName.md} px-3 text-sm`,
};

/**
 * A full-width list row that is itself the tap target — the `<label>` wrapping
 * a checkbox in Mining Tax's Settle Up / Link Payment / Bulk Dismiss dialogs,
 * and the single-line pick-a-row `<button>`s in the blueprint, skill and ship
 * pickers, the Build Group member list and the trained-skills list.
 *
 * Not a `ControlSize`: those rows keep their own `px-2 py-1.5 text-xs`
 * density, and a single line of that lands at 28px — exactly `sm`'s pointer
 * value, and exactly the "reusing a pointer size on a phone" mistake DESIGN.md
 * §3 calls out. So this pins the touch tier's 44px on a phone and reverts to
 * that same 28px above `md`, leaving pointer rendering pixel-identical (the
 * `min-h-11` / `md:min-h-7` shape #1055's Balances-strip fix established).
 * `min-h-*`, not `h-*`, so a row whose text wraps grows instead of clipping.
 */
export const tappableRowClassName = 'min-h-11 md:min-h-7';
