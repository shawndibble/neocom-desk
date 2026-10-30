# Scope decisions — Improve's sort is a labelled Select, not a SegmentedControl

_Recorded 2026-10-30._

- **Improve's Biggest gain / Best value / Cheapest is a `Select` under a visible "Sort by:" eyebrow, not a `SegmentedControl`,** though DESIGN.md puts 2–4 options in segments. As segments they read as a filter: a pilot picked Cheapest expecting cheaper modules, which is the Cheaper goal's job. The sort only orders the goal's own swaps; the label and the select say so. The colon is drawn, not translated, so the control's accessible name stays "Sort by".
- **The ticked-set summary lists DPS and EHP only when the shown figure changes,** compared at display rounding: "DPS 0 → 0" says nothing.
