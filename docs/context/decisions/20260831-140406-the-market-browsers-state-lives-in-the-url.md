# Scope decisions (round 7)

_Recorded 2026-08-31._

- The Market Browser's state lives in the URL as query parameters
  (`/market?type=…&region=…`), so a view is shareable and survives a reload.
  Path parameters are not an option: routes are keyed by literal path.
- Order rows are capped at 15 per side, with "show all (N total)" to expand.
  Sell sorts cheapest first, buy sorts highest first; columns are click-sortable.
- An order book is fetched when an item is selected and held for the 300
  seconds ESI itself caches it. The **Data Age** badge states how old the shown
  book is, and only the manual refresh control refetches — the Market Browser
  keeps the same refresh promise as every other API-derived view.
- The Quickbar is **Editable Data** — it syncs across devices. The Location Mode
  is not; it stays a device-local view preference like the current hub setting.
- **Station Pins** (issue #84, Assets page) are also **Editable Data**: a
  three-state pin per station (unpinned / pinned for one Character / pinned
  account-wide) that sorts the pinned station to the top of the tree and
  starts it expanded. An account-wide pin has no shared account identity to
  key a single record off — Account has no storage or sync (see below) — so it
  fans out: one pin row per Character currently known on this device, each
  synced under that Character's own ownerHash rather than a new account-level
  identity (parity plan §5.7's "write under every Character" recipe).
- A context-menu jump to a Build Plan stays visible for items no blueprint
  produces, reading "No blueprint options" rather than vanishing.
- The rebuild ships in two passes. Pass 1: two-column layout, search, Market
  Group tree, order book, Location Mode. Pass 2: Quickbar sync, Compare,
  Item Detail, context menus, price history.
