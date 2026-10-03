# Scope decisions — BPC Sourcing caps its table at 200 rows

_Recorded 2026-10-03._

- **Industry › BPC Sourcing shows at most 200 rows, taken from the top of
  the table's current sort, with a "Showing 200 of N" line above the
  table whenever more matched.** The owner asked for it directly. Past a
  couple of hundred copies, the answer is to narrow the search, not to
  scroll. This supersedes the BPC Sourcing part of
  `20260926-004049-public-contract-search-and-bpc-sourcing-virtualize-instead.md`
  (issue #1777). Its objection was a cap that "silently drops rows", and
  this cap says when it drops any. Contract Search's Items and Courier
  tabs stay uncapped and virtualized, as #1777 decided.
- **The cap follows the sort, and export ignores it.** Sorting by another
  column re-picks which 200 rows show, so the default Price sort keeps the
  cheapest. CSV export (`source: 'sorted-rows'`) still writes every
  matching row in the table's order. BPO badges are picked from the shown
  rows, so a badge never lands on a row the cap dropped.
