# Scope decisions — Searchable tables: search, column picker and filter funnel on one row

_Recorded 2026-09-24._

- **Every table with a search box gets a filter funnel and a column picker, on the search box's own line.** Search first, then the `ColumnPickerMenu` in `FilterBar`'s `actions`, then the funnel. Pages had drifted into three layouts — filters inline, a picker in the panel header, a picker in a toolbar row below — so the same control sat somewhere different on each page. Rules out a picker anywhere but `actions`, and a searchable table with no picker.
- **`FilterBar` hides its filters behind the funnel at every width, not only on a phone.** The opt-in `collapsible` prop is gone. Inline filters wrapped to a second row on most routes and pushed the picker away from the search. Costs one click to reach a filter on desktop; the badge count keeps "this list is filtered" visible without opening it.
- **Every table column with a scalar value is sortable.** Skipped on purpose: action/menu/checkbox columns, icon-only cells, editable-input cells (the row would jump mid-edit), screen-reader-only chart tables, one-row summaries and compare matrices.
- **Tables without a search box do not gain one here.** The Market order book's `search` slot holds item tabs, not a text search, so it keeps its per-table pickers in the section headers.
