# Scope decisions — Price History keeps every ESI history field, and splits the chart in two

_Recorded 2026-09-14._

- **`loadPriceHistory` keeps all six fields ESI sends, not three.**
  `/markets/{region_id}/history` has always returned `highest`, `lowest` and
  `order_count` beside `date`, `average` and `volume`; the mapper discarded
  them at the boundary. Keeping them costs no extra request — the response was
  already paid for — and it is what the daily-range band and the order-count
  series are drawn from. Rules out the alternative that was on the table: a
  second endpoint or a wider fetch to recover data the app was already
  receiving and throwing away.

- **The Price History summary's High and Low mean the days' own extremes, not
  the extremes of the daily average.** "High" beside a market chart means the
  highest price anything changed hands at, which is what `highest` reports; the
  old figures answered a subtly different question — the highest _daily mean_ —
  and read as the same one. The Median deliberately stays a median of the daily
  average, so one spike cannot move the middle of a typical day. Known cost,
  accepted: ESI's `lowest` carries genuine outlier fills (a mislisted 0.01 ISK
  order that someone took), so a Low can legitimately sit far under the band's
  visible mass. It is a fact about the day, not an artefact, and the Median is
  the stat to read past it.

- **One figure, two plots.** Price (the high/low band, the average, its moving
  average) sits above trading activity (volume bars, order count), sharing one
  X axis and one Recharts `syncId`. Five series across two unrelated scales do
  not fit one dual-axis plot: the band is a filled shape the volume bars draw
  straight through, and a second right-hand axis leaves little room for the
  plot. This also rules out the reverse option — dropping a series to keep one
  plot — since the two that would have gone are exactly the ones this work
  added.

- **The phone hides the order-count axis rather than moving that series onto
  the volume axis.** Recharts' `hide` keeps a scale while reserving no gutter,
  which is the point: order counts run in the hundreds against a volume scale
  in the millions, so sharing the axis flattened the line onto the baseline and
  read as "no orders at all". The legend and the tooltip carry the numbers the
  hidden axis no longer labels.

- **The order-count series is drawn in `text-dim`, not in a clock-kind hue.**
  `kind-order-expiry` names a deadline's origin on the Coming Up board
  (DESIGN.md §1) — identity only, no magnitude. A daily order _count_ is not an
  order expiry, and borrowing the token would give one hue two meanings, which
  is the fork §1 refuses. `text-dim` is the app's existing ordinal reading of
  "the secondary series", already carrying the moving average in the strip
  above; the two are told apart by strip, by dash, and by the legend. Rules out
  minting a chart-series palette, which §1 forbids outright.
