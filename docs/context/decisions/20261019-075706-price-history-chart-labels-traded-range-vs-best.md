# Scope decisions — Price History chart labels: traded range vs best order at close (issue #4333)

_Recorded 2026-10-19 · issue #4333._

- **The chart names what each mark measures.** The band is the day's lowest
  and highest _trade_ (ESI history); the Buy/Sell lines are the best order
  still _listed_ at the 23:45 UTC snapshot. Filled orders are gone by then, so
  the best buy left often sits below the day's lowest trade and the best sell
  above the highest. That is correct data, but read as "the lines are outside
  the range, so the chart is broken". So in the chart legend and the hover
  tooltip only: the band is **"Traded range"** (was "Daily range"), the lines
  are **"Best buy at close"** / **"Best sell at close"**, and
  **"{{region}} buy at close"** / **"{{region}} sell at close"** where a
  station or region names them ("Jita 4-4 buy at close").
- **The legend explains it.** A "?" `InfoTooltip` on the Traded range legend
  entry (DESIGN.md §6c: a "?" explains a term) says what the range is and, when
  Buy/Sell lines are drawn, why they can sit outside it. With no lines drawn
  (no open series, or the Lines select on Average) it only explains the range.
- **The table, the CSV and the Lines select keep their wording.** Column and
  export headers stay "Buy" / "Sell" / "Jita 4-4 buy" and "Daily range", and
  the select stays "Buy / Sell", "Buy", "Sell". They are a day list read
  column by column, where the short header is enough and a changed CSV header
  would break anyone's import. `openSideLabel` stays their shared helper;
  the chart uses a separate `chartOpenSideLabel` (`priceHistoryLabels.ts`).
- **Every series draws `linear`.** `monotone` turned a one-day swing into a
  wave that overshot between daily points, inventing prices nobody traded or
  listed. One `CURVE_TYPE` for the band, the price lines, the moving average,
  the compared averages and the activity strip's order-count line.
- **Out of scope:** the price axis tick values, and station vs region data (the
  station-level backfill is a separate maintainer-run step).
