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
- **From the desktop breakpoint the Ring fits its sticky editor column**: it
  takes the column's pinned height (`100vh − 2.5rem`) less what the column
  shows above it (tabs, panel header) and under it (readouts, legend, cargo),
  measured. A banner above the page no longer pushes the readouts out of the
  pinned column. The 20rem floor and 48rem cap stay. The shared Fitting page,
  the Start preview and the stacked layout keep the window − 24rem bound.
