# Scope decisions — Hauling moves from Market to Travel (issue #3526)

_Recorded 2026-10-10 · issue #3526._

_Superseded 2026-10-21 by `20261021-211648-hauling-moves-back-from-travel-to-market` (issue #4702)._

- **Hauling Opportunities is a Travel tab, after Route Safety, Thera / Turnur
  and Pilot Lookup (`/travel/hauling`).** Hauling is a route problem (what to
  carry from one Trade Hub to another), not a market lookup, and Market had
  too many tabs. This replaces the first half of
  `20260926-161750-hauling-opportunities-v1-scope` (a Market tab because it
  prices at Trade Hubs like Appraisal); the rest of that decision stands. The
  code stays in `src/features/market`, which owns the pricing it reads.
- **`/market/hauling` (any query, any hash) redirects to `/travel/hauling`.**
  Old links and bookmarks keep working; saved hidden or recent nav entries for
  the old path are dropped, not migrated, as with Pilot Lookup.
- **Travel gets no hub control.** Hauling never used Market's header hub
  picker: it has its own From/To hub pickers, defaulting from the saved Trade
  Hub. Its reload stays in the page title bar. A row's Show info now opens the
  app-wide item info, as on Assets, instead of Market's in-page Item Detail
  priced at Market's header hub: Travel has no header hub to price it at.
- **Switching into or out of Hauling starts the other tab with a clean query
  string.** Hauling's `from`/`to` name Trade Hubs and Route Safety's name
  systems; carrying one tab's over would hand the other the wrong kind. The
  other Travel tabs still share their query string.
- **Travel now has four tabs, so a phone shows the view picker instead of the
  strip** (rule from `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`).
  The picker pages are now Skills (4), Industry (4), Market (5) and Travel (4).
