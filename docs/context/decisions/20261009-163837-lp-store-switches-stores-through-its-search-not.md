# Scope decisions — LP Store switches stores through its search, not a header select

_Recorded 2026-10-09._

- **The LP Store page has no store picker in its header.** Supersedes
  `20260930-144709-select-box-lp-store-picker` for the Market page. On a phone
  the page already stacked the Market tab strip, then a select, then the search
  box; a view picker for long tab strips (see
  `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`) would have
  made it select on select on select. The landing search (#2873) already takes
  an item or a corporation name, so switching stores belongs there.
- **The landing search is the one way to find a store.** An empty box lists the
  stores the active Character holds LP with, highest balance first with the
  balance shown (the ordering `lpStorePickerOptions` gave the picker), so the
  "always the same store" pilot is still one tap away. A query matches item and
  corporation names as it does now: exact, then prefix, then substring, case
  insensitive (`rankedSearch`), so "fed" finds Federal Navy Academy.
- **Corporation matching and the empty list read the baked
  `lpCorporations.json`, not only the Firestore `lpStoreOffers` snapshot.**
  Today `searchLpStores` matches corporations only among the snapshot's stores,
  so an unavailable or incomplete snapshot would leave a pilot with no way into
  a store once the picker is gone. Jumps and item matches still need the
  snapshot; the corporation list does not.
- **An open store carries a "Change store" link back to the landing search,**
  beside the existing crumb for a store opened from a search result.
- **Wallet's Loyalty Points card keeps `LpStorePicker`.** It is a title-bar
  control on a card, not a page under a tab strip, and `20260930-144709`'s
  reasoning (a "Browse LP Stores" link reads worse) still holds there.
