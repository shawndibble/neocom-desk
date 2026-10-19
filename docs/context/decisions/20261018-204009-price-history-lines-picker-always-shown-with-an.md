# Scope decisions — Price History Lines picker always shown, with an Average choice

_Recorded 2026-10-18._

- **The Lines picker is always shown, open prices or not.** Buy / Sell lines
  exist only for the five Trade Hub regions
  (`20261018-121126-price-history-draws-daily-open-buy-and-sell.md`). Hiding
  the picker when the primary region had none left a non-hub reader with one
  unexplained line, and gave no way to change what a hub-plus-non-hub
  comparison draws.
- **A fourth choice, Average, draws every region's ESI average line** — the
  primary's and each compared region's, no Buy / Sell lines — so a hub and a
  non-hub region compare like for like. The summary drops its open-price
  medians under it, as it already did for the side Buy or Sell leaves out. The
  day table and its CSV export keep their Buy / Sell columns: they are the day
  list, not the drawing, as before.
- **Under Buy / Sell, Buy or Sell, a region without open prices keeps its
  average line, now labelled "<Region> average (no order data)"** (plain
  "Average Price (no order data)" for an uncompared primary, matching the
  existing average labels) in the legend, the tooltip and the line's name,
  with an info tip saying Buy and Sell are recorded for the five Trade Hubs
  only. The label applies only once the region's open-price read has come
  back with no series at all: not while it loads, and not for a hub whose
  series simply has no day in the selected range (that one keeps the plain
  average label). Under Average no region gets the note: average is the
  choice.
- **The stored choice keeps its key (`marketPriceHistorySeries`).** Old values
  (`both`, `buy`, `sell`) load as before; anything unknown falls back to Buy /
  Sell.
