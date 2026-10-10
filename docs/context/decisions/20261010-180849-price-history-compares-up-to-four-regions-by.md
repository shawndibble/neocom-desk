# Scope decisions — Price History compares up to four regions by their average line (issue #3518)

_Recorded 2026-10-10 · issue #3518._

- **Compared regions add their average line only.** The high/low band, the
  primary average and the 7-day moving average stay the primary region's; each
  compared region adds one average line. Five bands on one plot would be
  unreadable. The summary strip stays the primary region's too.
- **Up to four, in pick order, in the URL (`browser.compare`).** A fifth pick is
  ignored, not swapped for an earlier one. The list survives item changes,
  because a trader comparing Jita with Amarr is comparing them for the next item
  too. The primary region is dropped from the list rather than drawn twice.
- **Each slot borrows a clock-kind token plus its own dash.** No new chart-series
  token. The dash, and the region named in the legend and tooltip, mean colour is
  never the only cue. A region keeps its slot when a later pick is removed.
- **The day table and CSV stay the primary region's days.** They gain one
  "Average Price (Region)" column per compared region, blank where that region
  did not trade. A day only a compared region traded is drawn on the chart but
  not tabled: the table is still the primary region's day list.
- **The chart's X axis is the union of drawn regions' days.** The primary
  series bridge a day only a compared region traded (`connectNulls`). With
  nothing compared there is no such day, so the single-region chart is
  unchanged.
- **Loading is lazy, per region, and never blanks the chart.** A compared region
  is fetched only once picked, through the same cache as the primary region.
  Its legend entry says loading, couldn't load, or no trades in this range,
  while the other lines keep drawing.
- **No comparison for a Global Market Region item, or outside the Browser.**
  PLEX trades nowhere else, so there is nothing to compare. The Opportunities
  modals have no Browser URL, so they get no control.
