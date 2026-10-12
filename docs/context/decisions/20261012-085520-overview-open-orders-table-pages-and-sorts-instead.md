# Scope decisions — Overview Open Orders table pages and sorts instead of cutting at the size limit

_Recorded 2026-10-12._

- **The Open Orders widget's Table view pages (5 / 10 / 25 rows per page) and every column sorts, instead of cutting at the size's row limit and printing "+N more".** A hidden undercut order is a missed relist, so "top N plus a count" is the wrong answer for this table (see the triage-board decision). Paging is opt-in per table (`TableModel.pageable`) and sorting per column (`TableColumn.sortable` plus `TableRowModel.sort` keys, since cell text is display-only), so the other widgets' tables keep the cut until one of them needs it. Rows per page is a per-widget pref (`Widget.rowsPerPage`, default 10, stored only when changed); the current page and the sort are not persisted, and changing the sort or the page size returns to page 1. The Chart view's side table is never paged.
