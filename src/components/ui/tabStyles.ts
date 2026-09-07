import { controlHeightClassName } from './controlStyles';

/**
 * The horizontal tab-bar look, shared by the `Tabs` widget and by real
 * `NavLink` sub-navigation (`SkillsSubNav`).
 *
 * Two bars that sit in the same slot on the page and read as the same control
 * had drifted apart: the sub-nav was missing the active fill, the hover fill
 * and — the part that matters — the focus ring DESIGN.md §6 requires on every
 * interactive element. Keeping the classes here means the next bar cannot
 * quietly ship a fourth variation.
 *
 * Not re-exported from the barrel — it is styling, not a component, so it is
 * reached by deep import the way `@/components/ui/icons` is.
 */

/**
 * The scroll frame the bar sits in. A tab bar has no second line to wrap onto
 * — the baseline is one hairline across the page — so past a certain width the
 * choice is between scrolling it and losing the tabs off the right edge. On a
 * 390px screen that is not a corner case: Settings' four tabs, Market's four
 * and Wallet's three already run past it.
 *
 * Two things stop this being a plain `overflow-x-auto` on the bar itself. The
 * scroller has to be an element *outside* the bar, because the active item's
 * `-mb-px` deliberately hangs 1px past the bar's content box to cover the
 * baseline, and a scroll container clips exactly that overhang — every active
 * underline in the app would quietly thin from 2px to 1px. Wrapping instead
 * leaves the overhang inside a box whose own overflow is visible, so the
 * mechanism keeps working untouched. And the scrollbar is hidden
 * (`.tab-scroller`, `src/styles/index.css`): a native horizontal scrollbar
 * renders in the same few pixels as the baseline and the active underline,
 * which is the one part of this control that carries meaning. The affordance
 * is the tab cut off at the edge, the way every tab bar on a phone does it.
 */
export const tabScrollerClassName = 'tab-scroller overflow-x-auto overscroll-x-contain';

/**
 * The bar itself: hairline baseline the active item's underline overlaps.
 *
 * `w-max min-w-full` is what keeps that baseline honest inside the scroller:
 * it grows to the full scroll width when the tabs overflow, so the hairline
 * does not stop at the viewport edge mid-swipe, and falls back to the frame's
 * width when they fit. It is also why an unwrapped bar is unchanged — with
 * nothing to overflow, `w-max` resolves to the `min-w-full` floor.
 */
export const tabListClassName = 'flex w-max min-w-full items-end gap-1 border-b border-line';

/**
 * One item, in either state. `-mb-px` lands its underline on the bar's
 * baseline. Height comes from the shared `controlHeightClassName.md` scale
 * (DESIGN.md §3's one-file rule — never hand-write a height here) rather
 * than the flat mouse-pointer `h-8` this used to be: these bars are tapped
 * constantly (Overview/Skills/Wallet/Market/Mail/Calendar sub-nav) and were
 * the only control left on a mouse-pointer height regardless of viewport.
 *
 * `shrink-0` and `whitespace-nowrap` are what give the scroller something to
 * scroll: without them flex squeezes the items toward their content width
 * instead of overflowing, and a bar that is one tab too wide reads as a row
 * of cramped, wrapped words rather than a row you can swipe.
 */
export const tabItemClassName = `-mb-px inline-flex ${controlHeightClassName.md} shrink-0 items-center border-b-2 px-3 text-xs font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`;

export const tabItemActiveClassName = 'border-accent bg-panel-2/60 text-text';

export const tabItemIdleClassName =
  'border-transparent text-text-dim hover:bg-panel-2/40 hover:text-text';
