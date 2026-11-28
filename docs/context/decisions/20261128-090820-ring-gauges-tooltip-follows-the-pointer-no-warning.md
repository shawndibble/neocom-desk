# Scope decisions — Ring gauges: tooltip follows the pointer, no warning tint at capacity

_Recorded 2026-11-28._

- **A Fitting ring rim gauge's tooltip opens at the pointer (`PointTooltip`), not at the arc's bounding box.** The arcs are long, so their box centre sat far from the cursor. Ruled out: a `followCursor` mode on `Tooltip`, which would fork the Radix placement, Escape and aria handling.
- **A rim gauge keeps its base colour right up to the budget and turns red only when over.** The yellow "tight" tint at 98% and above is gone from the ring arcs. The rack list's resource bars and the Improve makeover keep their tight cue.
