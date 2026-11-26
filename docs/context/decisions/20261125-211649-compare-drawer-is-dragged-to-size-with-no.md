# Scope decisions — Compare drawer is dragged to size, with no Expand button

_Recorded 2026-11-25._

- **The grip is the pointer path to the Compare drawer's height, and Expand / Restore is gone.**
  The button offered exactly two heights — whatever had been dragged, and 80vh — beside a 6px
  resize bar that was hard to aim at, so the quick way to a tall drawer bypassed the drag and left
  the drag a fiddly afterthought. The grip is now a 24px band (36px on touch) carrying the shared
  `grabberClassName` mark, and it drags to any height from `MIN_HEIGHT` to 80% of the viewport. 24px
  rather than a pseudo-element overhang, which §6c forbids for new work. The ceiling is
  viewport-derived rather than the old fixed 560px, which either stopped short on a tall monitor or
  let the drawer cover its own handle in a short window. This rules out a height-mode axis in the
  drawer's state: it is open or closed.
- **The header is a second drag zone.** The ask was to drag the drawer, not to aim at a hairline,
  so the header drags it too and only the scrolled body does not — the same split `Modal` makes for
  a sheet. Safe because the gesture latches at §6c's 4px activation distance and only then captures
  the pointer, so a press on a control in the header still reaches it.
- **Carrying the drag past the minimum height closes the drawer.** Under `MIN_HEIGHT` it stops
  shrinking and slides toward the bottom edge instead, so "shorter" and "away" are one gesture,
  committing at the distance a sheet swipe uses (`SWIPE_DISMISS_DISTANCE`). A committed pull then
  travels the rest of the way off before the drawer closes, because closing on release unmounts the
  box before the slide can be seen. The ✕, Escape and the handle still close it, and the arrow keys
  (plus Home and End) still reach every height, so neither the resize nor the dismissal is
  drag-only (WCAG 2.5.7).
- **No velocity test, unlike `useSheetSwipe`.** Not because the grip is only ever a mouse — it
  renders on a coarse pointer at `md` and up, where it is a thumb — but because this gesture also
  resizes. A fast drag here is usually someone reaching for a taller drawer in a hurry, and
  dismissing on speed would throw the Compare Set away on the way up.
- **The gesture lives in `src/components/ui/useDrawerResize.ts`, not in the feature.** It sits
  beside `useSheetSwipe` and `useRowSwipe` and follows their pointer pattern — capture plus React
  handlers, the shared `DRAG_SLOP`, and a `pointercancel` path — rather than a fourth hand-rolled
  copy on `window` listeners, which is what the first cut of this was and which leaked its
  listeners when a gesture was cancelled. `clamp` comes from `src/engine/math.ts`; a local
  `clampHeight` was a private copy of a listed shared helper.
- **The page still reserves everything the bar covers, at every height.** The old two-tier publish
  of `--compare-drawer-space` existed only because Expand jumped to 80vh in one click, and padding
  `main` by 80vh of blank scroll was not what that click asked for. With the height dragged by hand
  that case is gone, and a cap was tried and dropped: it left the content under a tall drawer
  impossible to scroll into view, which is the whole point of the reservation.
  `--compare-drawer-clearance` is untouched and still tracks the real covered height (WCAG 2.4.11).
- **Not done here.** Below `md` the drawer is a full-screen sheet with no grip, so it has neither a
  grabber nor the swipe-down §6c gives a bottom sheet — a pre-existing gap this change does not
  close. `useSheetSwipe` cannot simply be pointed at it: that hook tests `hasAttribute('open')`,
  so it only drives a `<dialog>`. The phone branch's hand-rolled ancestor-sibling `inert` walk and
  focus juggling are the other half of the same remainder; collapsing the height modes is what
  makes moving that branch onto `Modal`'s `sheet-full` placement cheap, and that is its own change.
