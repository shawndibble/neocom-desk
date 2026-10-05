# Scope decisions — Thera / Turnur filters are selects (issue #2607)

_Recorded 2026-10-04 · issue #2607._

- **Hub, Exit and Fits are content-sized selects, like Route.** The
  segmented controls needed about 1269px against a 1128px inner width at
  `max-w-6xl`, so Route always wrapped onto a row of its own. The pointer-width
  row is now From, Hub, Exit, Fits, Route, each trigger sized to its longest
  option (not the current value) so it never jumps. This supersedes the "Exit
  is a five-segment `SegmentedControl`, Fits stays six" bullet of
  `20261003-190356-thera-turnur-back-to-a-slim-table.md`. Trade-off accepted:
  switching is two clicks, and Hub counts show only once the menu is open.
  Phone chips are unchanged.
