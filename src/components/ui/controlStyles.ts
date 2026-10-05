import { cx } from '@/lib/cx';

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
 * The shared interaction recipe (DESIGN.md §6c "States and motion"): every
 * interactive primitive composes these so transition, focus and disabled
 * behave the same everywhere instead of being re-spelled per control.
 *
 * - `interactiveClassName`: colour properties only, 120ms ease-out, snapping
 *   in at 40ms while pressed (`active:duration-40`), and no transition at all
 *   under reduced motion. Never a transform.
 * - `focusRingClassName`: the 2px accent outline, outset, for boxed controls
 *   and inline links.
 * - `focusRingInsetClassName`: the same ring drawn inside the box, for
 *   full-bleed rows, tabs and nav items (an outset ring would be clipped by
 *   the row's neighbours or its scroller).
 * - `disabledClassName`: `opacity-40` and `cursor-not-allowed` for both the
 *   native attribute and `aria-disabled` (the one that keeps a tooltip able
 *   to open).
 */
export const interactiveClassName =
  'transition-[color,background-color,border-color,text-decoration-color,outline-color] duration-120 ease-out active:duration-40 motion-reduce:transition-none';

export const focusRingClassName =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const focusRingInsetClassName =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

/**
 * A full-width row or list item that is itself the control: the `panel-2` hover
 * fill, a step darker while pressed, and the shared transition. Compose the
 * focus ring (inset for rows) separately.
 */
export const rowInteractiveClassName = cx('hover:bg-panel-2 active:bg-panel', interactiveClassName);

export const disabledClassName =
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

/**
 * Heights, per DESIGN.md §3: `h-7` compact / `h-9` default for a pointer, one
 * step up on a touch viewport so a thumb gets a 44px target. Touch means below
 * `md` *or* a coarse primary pointer (`touch:`, see `index.css`), so a touch
 * tablet keeps the touch tier at every width; `touch:` is declared after `md:`
 * and wins above it, and a fine pointer renders exactly as before. `IconButton`
 * shipped this tier first (`size-11 md:size-9`); it lives here now so the text
 * controls beside it match at *both* breakpoints instead of only on desktop.
 *
 * `StatChip` and `DataAgeBadge` deliberately stay at a flat `h-7` — they are
 * readouts, not targets, and growing them on a phone would only cost rows.
 */
export const controlHeightClassName: Record<ControlSize, string> = {
  sm: 'h-9 md:h-7 touch:h-9',
  md: 'h-11 md:h-9 touch:h-11',
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
export const tappableRowClassName = 'min-h-11 md:min-h-7 touch:min-h-11';

/**
 * A 44px hit area on a coarse pointer for a small native control (a checkbox,
 * a radio) without moving anything: an invisible `::before` 14px past the 16px
 * box on every side. Pseudo-elements belong to their element, so a tap on the
 * padding checks the box, and layout is untouched.
 */
export const touchHitAreaClassName =
  "touch:relative touch:before:absolute touch:before:-inset-3.5 touch:before:content-['']";

/**
 * A 44px hit area on a coarse pointer for a small drag grip: an invisible
 * `::before` square centred on the grip, so a thumb finds a 16px glyph without
 * the row growing. The grip keeps `touch-none` itself (drag only from a grip).
 */
export const gripHitAreaClassName =
  "touch:relative touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:size-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2 touch:before:content-['']";

/** An inline text action beside a status message — an Undo, a "jump to it". */
export const inlineLinkClassName = cx(
  'text-accent font-medium underline decoration-1 underline-offset-2 rounded-xs hover:decoration-2 active:text-accent/75',
  interactiveClassName,
  focusRingClassName
);

/**
 * A bordered toggle chip's on/off state, per DESIGN.md §4: `FilterChip`'s
 * accent tint when on, the input fill with dim text when off. `FilterChip`
 * takes it from here, and so does any hand-built toggle chip whose content
 * `FilterChip` can't carry (an avatar, a spinner, an emblem) — Skill Compare's
 * character picker, the Ship Tree's `FactionBar` — so the three can't drift
 * apart again (issue #2287).
 *
 * `hoverable: false` drops the off state's hover for a chip that can't
 * currently be toggled. Not for `SegmentedControl`, whose segments have no
 * border of their own.
 */
export function toggleChipStateClassName(
  selected: boolean,
  { hoverable = true }: { hoverable?: boolean } = {}
): string {
  if (selected) {
    return hoverable
      ? 'border-accent-dim bg-accent/15 text-accent hover:bg-accent/22 active:bg-accent/28'
      : 'border-accent-dim bg-accent/15 text-accent';
  }
  const off = 'border-line bg-panel-2 text-text-dim';
  return hoverable ? `${off} hover:border-line-bright hover:text-text active:bg-panel` : off;
}
