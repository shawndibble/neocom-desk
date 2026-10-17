# Scope decisions — Fitting editor page capped at 120rem (issue #3976)

_Recorded 2026-10-16 · issue #3976._

- **The open Fitting's page content (header and grid) stops at 120rem, centred.**
  Past it the width becomes even side gutters, not a wider Ring panel.
- **In the Ring view the Ring's track stops at 52rem** (the 48rem Ring and its
  panel); the stats track keeps 22–28rem (22–26rem beside the docked Add
  browser), and the tracks centre. The List view keeps a `1fr` track inside
  the same page cap: its rows want the width.
- **The Ring's block (Ring, readouts, legend, cargo) keeps the Ring's 48rem
  width**, centred in its panel.
- **From the desktop breakpoint the Ring also fits its sticky editor column**
  (amends the window-height bound of `20261003-083902`): it is never larger
  than the column's pinned height (`100vh − 2.5rem`) less what the column
  shows above it (tabs, panel header) and the readouts under it, measured.
  The old window − 24rem bound stays as well, so the first load is unchanged;
  once the column pins, a banner above the page can't push the readouts out.
  Legend and cargo may scroll in the column. The 20rem floor and 48rem cap
  stay. The shared Fitting page, the Start preview and the stacked layout
  keep only the window − 24rem bound.
