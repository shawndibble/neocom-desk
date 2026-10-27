# Scope decisions — Public contract search and BPC Sourcing virtualize instead of capping (issue #1777)

_Recorded 2026-09-26 · issue #1777._

- **Contract Search's Items and Courier tabs and Industry › BPC Sourcing
  hand `DataTable` every row the snapshot returns, windowed with
  `virtualize`, instead of a 50-row cap behind "Show all".** The owner
  skipped the ticket's measure-first step and chose virtualization
  unconditionally: a cap silently drops rows the reader asked for, while a
  window keeps every row reachable at the render cost of a screenful. This
  supersedes the cap reasoning in
  `20260912-050724-contract-search-reads-the-shared-snapshot-as-its.md`
  (the cap "exists to prevent" handing `DataTable` the full corpus) and the
  "behind Show all" wording in
  `20260922-165702-bpc-sourcing-flags-market-and-contract-bpos-market.md`
  and `20260912-141100-courier-hauls-rank-on-isk-per-jump-and.md`; their
  other decisions stand. The `items.all`, `courier.all` and `sourcing.all`
  URL params go with the cap — an old link carrying one just ignores it.
- **`virtualize` is opt-in on `DataTable` and windows against the page
  (`useWindowVirtualizer`), not an inner scroll box.** Same reason as
  `NotificationsPanel`: a boxed scroller buried in the page reads as cramped,
  and `DataTable` promises callers no wrapper element around its `<table>`.
  Phone `groupBy` (Courier's lane folding) stays unwindowed — collapsed lanes
  mount nothing. `highlightRowKey` and `expandableRow` are not supported with
  it; none of the three panels use them.
