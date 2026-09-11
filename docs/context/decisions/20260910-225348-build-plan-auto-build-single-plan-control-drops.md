# Scope decisions — Build Plan Auto Build: single-plan control drops its re-run button

_Recorded 2026-09-10._

- **`BuildPlanAutoBuildControl.tsx` (the single-plan Auto Build control)
  drops the icon-only re-run button (`Icon.Run`) it used to carry beside the
  Build Strategy select.** On direct instruction: a single Build Plan's
  fields already recompute live as they change, so a standing "apply again"
  affordance at this level was judged not worth keeping — Auto Build on a
  single plan is meant to be one pick of a strategy, not a control you come
  back to press again. The Build Group's own `AutoBuildControl` is
  unaffected — it still requires an explicit Apply behind an overwrite
  confirmation, because one press there rewrites every member plan, a blast
  radius the single-plan surface never had.

- **What this leaves without a dedicated control, accepted as the tradeoff:**
  a controlled `<select>` never fires a change event for reselecting its
  own already-shown value (Radix's `useControllableState`, same as a native
  `<select>`), so re-running the _same_ strategy — after nothing (the
  default Cost-effective never gets its first press from a pilot who never
  touches the dropdown) or after a hand-edited `buildHere` — has no direct
  affordance anymore. The reachable workaround is picking a different
  strategy and back, which does fire two real changes. This is a real,
  known gap, not an oversight: the run button existed originally to close
  exactly this gap (see the 20260910-082156 decision this supersedes for
  this surface), and removing it re-opens it deliberately in exchange for a
  simpler row.
