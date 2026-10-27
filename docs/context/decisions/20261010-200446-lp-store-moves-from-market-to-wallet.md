# Scope decisions — LP Store moves from Market to Wallet (issue #3527)

_Recorded 2026-10-10 · issue #3527._

- **LP Store is a Wallet tab: Balance, Journal, LP Store.** LP balances already
  live on Wallet › Balance, and the store is where they are spent, so the two sit
  on one page. This replaces the Market placement from
  `20261002-145653-lp-store-under-market-pilot-lookup-its-own`. Wallet's
  `transactions` entry stays a hidden alias that redirects to Market › History ›
  Transactions; it is not a shown tab.
- **The store keeps its own nested route, `/wallet/lp-store[/:corporationId]`.**
  It outranks Wallet's `/wallet/*` and draws Wallet's tab bar itself, the way it
  drew Market's. The loyalty scope gate (`LP_STORE_REQUIREMENT`) moves with it
  unchanged.
- **Old links redirect for good.** `/market/lp-store[/:corporationId]` moves via
  Market's `PAGE_LEGACY_LOCATIONS` (as `/market/hauling` does), keeping the
  corporation id and query. `/wallet/loyalty[/:id]` now goes straight to
  `/wallet/lp-store`, with no hop through Market.
