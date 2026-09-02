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

/** The bar itself: hairline baseline the active item's underline overlaps. */
export const tabListClassName = 'flex items-end gap-1 border-b border-line';

/** One item, in either state. `-mb-px` lands its underline on the bar's baseline. */
export const tabItemClassName =
  '-mb-px inline-flex h-8 items-center border-b-2 px-3 text-xs font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

export const tabItemActiveClassName = 'border-accent bg-panel-2/60 text-text';

export const tabItemIdleClassName =
  'border-transparent text-text-dim hover:bg-panel-2/40 hover:text-text';
