# Scope decisions — Market History By station view and station filter (issue #5660)

_Recorded 2026-10-30 · issue #5660._

- **By station is a view chip, not a grouped base view.** The base transactions list stays flat; an accent `FilterChip` (DESIGN.md §6c, row-grain view) turns on one always-grouped header per station. Rules out a group on/off switch inside the view.
- **Groups are ordered by a "Stations by" picker (Net, Name, Trades), separate from the row sort.** Rows inside a group keep the column sort (newest first by default). This is `DataTableGroupBy.groupCompare`, so no page sorts rows by hand.
- **Station names resolve for every distinct location in the loaded fills, regardless of the Location column.** Only the few ids present are asked (a structure is a lookup each), so the Station filter can name stations a filter has hidden. Grouping and filtering key on `location_id` alone.
- **The Station filter is a multi-select in both views; the corp wallet gets neither field.** The filter fields live on the shared `WalletTransactionFilter`, but the corp bar renders no control for them.
