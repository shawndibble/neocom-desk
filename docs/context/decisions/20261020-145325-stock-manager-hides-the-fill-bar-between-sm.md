# Scope decisions — Stock Manager hides the fill bar between sm and xl (issue #4542)

_Recorded 2026-10-20 · issue #4542._

- **The Stock Manager table has no fill bar (and no bar legend) from `sm` up
  to below `xl`; phone cards and `xl`+ keep it.** At 1024px the table with the
  bar was wider than its panel, so the page scrolled sideways and Status, the
  column the page exists to answer, landed off-screen. The Status pill carries
  the bar's reading in that range. This narrows the bar designed in "Stock
  Targets v1 scope"; it rules out an `overflow-x-auto` wrapper (moves the
  scroll, leaves Item starved) and a per-breakpoint `DataTable` column facility.
