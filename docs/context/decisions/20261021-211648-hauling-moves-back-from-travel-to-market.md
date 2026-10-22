# Scope decisions — Hauling moves back from Travel to Market (issue #4702)

_Recorded 2026-10-21 · issue #4702._

- **Hauling Opportunities is a Market tab again, after Appraisal
  (`/market/hauling`).** This supersedes `20261010-193521-hauling-moves-from-market-to-travel`.
  A player's feedback: hauling is a commercial activity, not just travel, and
  Hauling Opportunities ranks hub-to-hub price gaps, which is trading.
- **`/travel/hauling` (any query, any hash) redirects to `/market/hauling`**,
  via `PAGE_LEGACY_LOCATIONS`; the old `/market/hauling` → Travel redirect is
  gone. Saved hidden or recent nav entries for `/travel/hauling` are dropped,
  not migrated, as #3526 did for the old path.
- **Hauling keeps its own From/To hub pickers.** Market's header hub picker
  stays off it (`usesHubPicker`). Its reload and the scan's Data Age sit in
  Market's title bar.
- **Switching into or out of Hauling still starts the other tab with a clean
  query string** (Hauling's `from`/`to`/`cat` are its own). A row's Show info
  is Market's in-page Item Detail again (DESIGN §6c, Market context).
- **Travel is back to two tabs** (Route Safety, Pilot Lookup); Market has six
  and keeps its tab strip.
