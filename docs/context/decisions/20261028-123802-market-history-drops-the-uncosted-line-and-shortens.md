# Scope decisions — Market History drops the uncosted line and shortens the no-buy label (issue #5399)

_Recorded 2026-10-28 · issue #5399._

- **<Decision>.** <Why, and what it rules out.>

- **Supersedes the uncosted line** of the #4736 decision. The totals strip no longer says "N sales uncosted · X ISK"; it told a reader nothing the per-row reason did not. `trading.uncosted` stays in `tradingSummary.ts` (tested, no renderer) for a later use.
- **`noBuy` reads "No wallet buy".** The hint tooltip still explains why.
- **Number columns size to the loaded rows.** Page-local `fitColumnWidth`, not a `DataTable` option: the widest value across all loaded fills, so a virtualized window never shifts a column.
- **Item wraps to two lines on a phone** instead of truncating; `sm` up still truncates.
