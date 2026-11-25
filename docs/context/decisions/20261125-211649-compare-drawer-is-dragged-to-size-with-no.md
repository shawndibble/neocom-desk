# Scope decisions — Compare drawer is dragged to size, with no Expand button

_Recorded 2026-11-25._

- **The grip is the only pointer path to the Compare drawer's height, and Expand / Restore is
  gone.** The button offered exactly two heights — whatever had been dragged, and 80vh — beside a
  6px resize bar that was hard to aim at with a mouse, so the quick way to a tall drawer bypassed
  the drag and left the drag a fiddly afterthought. The grip now carries a sheet's grabber mark on
  a 12px band (36px on touch, `resizeHandleTouchClassName`) and drags to any height from
  `MIN_HEIGHT` to 80% of the viewport, with the arrow keys it already had plus Home and End for the
  two ends. The ceiling is viewport-derived rather than the old fixed 560px, which either stopped
  short on a tall monitor or let the drawer cover its own handle in a short window. This rules out
  a height-mode axis in the drawer's state: it is open or closed.
- **Carrying the drag 80px past the minimum height closes the drawer.** Under `MIN_HEIGHT` it
  stops shrinking and slides toward the bottom edge instead, so "shorter" and "away" are one
  gesture, committing at the distance a sheet swipe uses (`SWIPE_DISMISS_DISTANCE`, DESIGN.md §6c).
  No velocity test, unlike `useSheetSwipe`: a flick is a thumb gesture and this grip is aimed with
  a mouse, where a deliberate overshoot reads better than a fast one. The ✕, Escape and the handle
  still close it, so neither the resize nor the dismissal is drag-only (WCAG 2.5.7).
- **The page reserves at most a default-height drawer's worth of bottom space.** Now that any
  height is a drag away, `--compare-drawer-space` is `min()`-capped at the handle plus
  `DEFAULT_HEIGHT` instead of switching tiers when Expand was pressed: padding on `main` never
  re-lays-out mid-drag, and a drawer deliberately pulled over the page does not push 80vh of blank
  scroll below the content. `--compare-drawer-clearance` is untouched and still tracks the real
  covered height, so focus still scrolls clear of the bar (WCAG 2.4.11).
