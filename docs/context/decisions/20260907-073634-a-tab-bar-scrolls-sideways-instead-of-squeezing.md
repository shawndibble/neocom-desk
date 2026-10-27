# Scope decisions — A tab bar scrolls sideways instead of squeezing

_Recorded 2026-09-07._

- **A tab bar that outgrows its frame scrolls sideways; it never squeezes and
  never wraps.** There is no second line to wrap onto — the baseline is one
  hairline across the page — so the only alternatives were compressing the
  items or losing them off the right edge. On a 390px screen this is not a
  corner case: Settings' four tabs, Market's four and Wallet's three all run
  past it, and flex's default shrink turned that into cramped, wrapped words
  rather than a row you could get to. `shrink-0` and `whitespace-nowrap` on
  the item are what give the scroller something to scroll.

- **The scroller is a wrapper around the tablist, never the tablist itself.**
  The active item's `-mb-px` deliberately hangs 1px past the bar's content box
  so its 2px accent covers the 1px baseline, and a scroll container clips
  exactly that overhang — `overflow-x-auto` on the bar would have thinned every
  active underline in the app from 2px to 1px, in the one place this control
  carries state. Wrapping leaves the overhang inside a box whose own overflow
  is visible, so the baseline mechanism is untouched. The bar itself takes
  `w-max min-w-full`: the hairline then spans the full scroll width instead of
  stopping at the viewport edge mid-swipe, and an unwrapped bar is unchanged,
  because with nothing to overflow `w-max` resolves to the `min-w-full` floor.

- **The scrollbar is hidden, and the cut-off tab is the affordance.** A native
  horizontal scrollbar is drawn in the bottom few pixels of its scroller —
  the same pixels as the baseline and the active underline — so on a narrow
  desktop window it would strike through the state. This is not the hidden
  scroller `docs/DESIGN.md` warns about for a stat strip: a stat nobody would
  think to scroll for is lost, whereas a tab half off the edge is how every
  tab bar on a phone says there is more. `overscroll-x-contain` keeps a swipe
  that runs out of tabs from chaining into the page or a browser back gesture.

- **`Tabs` scrolls the selected tab into view; the `NavLink` sub-navs do
  not.** A click brings its own tab into view and an arrow key focuses one,
  which scrolls to it — so the only uncovered case is a selection changed from
  outside the component, which today means a deep link (`/settings#notifications`
  opens Settings' second tab with no click anywhere). The three sub-navs have
  no selection to react to, only a route, and three items each that are
  unlikely to overflow; they take the scrolling and skip the rest rather than
  growing a shared hook for a case none of them has yet.
