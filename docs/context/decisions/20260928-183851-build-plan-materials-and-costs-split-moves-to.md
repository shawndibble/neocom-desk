# Scope decisions — Build Plan Materials and Costs split moves to xl (issue #2165)

_Recorded 2026-09-28 · issue #2165._

- **Build Plan detail puts Materials and Costs & revenue side by side from
  `xl` (1280px), not `lg`.** At 1024 the fixed 20rem Costs & revenue column
  left the Materials table ~189px short, hiding Price and Line total (the
  override input included) with no scroll cue. Narrowing Costs & revenue
  could not close the gap without starving its own rows. Dropping a Materials
  column at `lg` (the other option in the ticket) was rejected in favour of
  this breakpoint-only change. The trade: between 1024 and 1279px, Costs &
  revenue sits below Materials instead of beside it.
- **Costs & revenue still opens expanded from `lg`**, even though it now
  stacks up to `xl`. Its default follows `useIsDesktop` (`lg`) on purpose.
  Collapsing it in the 1024–1279 range would bury the profit figures even
  further down a page that already moved them. Don't "fix" that default to
  `xl`.
