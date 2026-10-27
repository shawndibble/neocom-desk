# Scope decisions — LP Store is a Market tab with an item-first search (issue #2873)

_Recorded 2026-10-09 · issue #2873._

- **LP Store is a `MARKET_TABS` entry (`lp-store`), not a Market nav sub-view.** Supersedes the "sub-view, not a tab" part of `20261002-145653-lp-store-under-market-pilot-lookup-its-own`; its other half (balances stay on Wallet) stands. The `/market/lp-store[/:corporationId]` routes stay their own routes (they carry the loyalty-scope gate, which Market's `/market` gate does not), so `LoyaltyStore` draws Market's tab bar itself and Market's bar links across by path.
- **`/market/lp-store` is an item-first search.** One box (`?q=`) matches an item name or a corporation name across every LP Store. Results are stacked Panels grouped by item, nearest store first, with Profit and ISK/LP columns like the store view; a row opens that store with the offer selected, under a crumb back to the search.
- **Data is a daily Firestore snapshot (`lpStoreOffers`)** built by the scheduled function `syncLpStoreOffers` from ESI's public per-corporation offers, with each corporation's station systems baked from the SDE (`functions/src/data/lpCorpStationSystems.ts`). Prices are not stored: ISK/LP is computed client-side for the matched offers only, at the page's hub and price basis. A run that loses more than a tenth of the corporations publishes nothing.
- **A corporation with several stations is as far as its nearest station**, and the nearest station's system is named. A corporation with no reachable station (or no Current System) has no distance and sorts last; it never ranks as 0 jumps.
- **"Affordable only" does not apply to the cross-store search** (it would hide every store you hold no LP in); it stays on the single-store view. The loyalty-scope gate stays as the single-store view has it.
- **Cost:** `syncLpStoreOffers` is one more Cloud Scheduler job past the free three (eight scheduled functions in total).
