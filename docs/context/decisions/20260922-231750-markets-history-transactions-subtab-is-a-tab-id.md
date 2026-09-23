# Scope decisions — Market tabs as paths (issue #1301)

_Recorded 2026-09-22 · issue #1301._

- **`/market/history/transactions` is a `MARKET_TABS` entry whose id is the
  literal string `'history/transactions'`, not a nested subtab of `history`.**
  `tabFromPathname` (`src/lib/pageTabs.ts`, ADR 0015) only ever compares one
  path segment against a tab's `id` for string equality, so giving a tab an id
  containing a `/` makes a two-segment path resolve without teaching
  `tabFromPathname`, `usePageTab` or `TabRoute` anything about subtabs. It is
  deliberately left out of the `Tabs` bar's own `tabs` array — `HistoryViewSelect`,
  a select inside History's own header (round 54), is still what switches
  between the two, now driving `usePageTab`'s `setTab` instead of a query
  param. `docs/ARCHITECTURE.md` §9 documents the general technique for any
  future one-level subtab that isn't itself a second row of tabs.
- **Market Browser's item Market Data / Price History split (`itemTab`) stays
  a scoped query param (`browser.itemTab`), not a `/market/browser/<subtab>`
  path.** The issue left this open ("sub-path of browser, or scoped param —
  pick one"). It only ever matters with an item already selected via `?type=`,
  so it rides along with that param rather than living a path segment beneath
  Browser; a path would also collide with the Browser's own use of the tree
  search box and Location Mode chips, which have nothing to do with the
  selected item's own split.
- **Open Orders' whole filter (`OpenOrdersFilter`) is one `useUrlParams` group,
  keys scoped `orders.*`.** The old one-shot `openOrdersFilterFromParams`
  (read once via `openOrdersFilterFromParams(searchParams, DEFAULT_FILTER)` at
  mount) is retired — every field, including the two the Overview board's tiles
  already deep-linked (`problem`, `character`), is now live in both directions.
  `problem`/`character` moved from repeated params (`problem=a&problem=b`) to
  comma-joined ones (`orders.problems=a,b`), matching every other multi-value
  codec in `src/lib/urlState.ts` (`idListParam`, `enumSetParam`) rather than
  keeping a second, bespoke encoding alive for just this one page.
- **Order History's filter and sort are `history.*`-scoped; Transactions gets
  neither.** Transactions' `DataTable` declares no `sortValue` on any column
  today (no sortable headers exist to persist), and it has no filter bar at
  all — adding URL-backed sort there would mean inventing sortable columns
  the ticket didn't ask for, not just moving existing state into the URL.
