# Scope decisions (round 25) — Industry side-by-side layout

_Recorded 2026-09-02._

- **Round 21's "Calendar and Industry remain deferred" is partly reversed**
  (issue #159). Industry is now the second of round 19's three deferred
  pages to convert from vertically-stacked master-detail to a real
  side-by-side pane, in the same shape SkillPlans took in round 21 and Mail
  in round 18: list left at `20rem`, detail right, `useIsDesktop`-driven
  `hidden`-class toggling on narrow screens, and a back control shown only
  when narrow. **Calendar remains deferred.**
- **The narrow-screen collapse keys on the explicit `selectedId`, not
  `effectiveSelectedId`.** Industry (unlike Mail and SkillPlans) falls back
  to auto-selecting the first plan so the desktop pane is never empty. That
  fallback must not drive the collapse, or a narrow-screen visitor would
  land inside whichever plan sorted first instead of on the list.
- **The detail subtree is not rendered at all while collapsed away**, rather
  than merely `hidden`. `BuildPlanDetail` fetches market prices for its
  plan's materials on mount; mounting it behind `hidden` would spend a
  narrow-screen visitor's bandwidth on a plan they never opened.
- **The detail pane's inner scroll is `lg:`-gated**, unlike the list pane's.
  `BuildPlanDetail` stacks three top-level Panels, so an unprefixed
  `max-h-[32rem]` would squeeze a viewport-sized editor into a nested
  scroll region on a phone — the same argument round 21 made for
  `SkillPlanEditor`. The list pane keeps the unprefixed cap it shares with
  `PlanListPane`.
- **The two-pane idiom is still not extracted into a shared component**, and
  this is now a deliberate, recorded choice rather than an omission. The
  breakpoint hook was worth extracting at copy three (round 21) because it
  was identical logic; the surrounding markup is not. Each of the four pages
  differs in what gates visibility (Mail and Industry on a selection, the two
  SkillPlans routes on the route itself), in whether the detail pane is
  wrapped in a `Panel`, in which pane owns the scroller, and in whether that
  scroller is `lg:`-gated. A component absorbing all four would take more
  props than the markup it replaces. Revisit if a fifth page wants the same
  shape.
