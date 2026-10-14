# Scope decisions — Offers snapshot read from R2 by type, Firestore as fallback (issue #3746)

_Recorded 2026-10-14 · issue #3746._

- **R2 first, Firestore on any failure.** Every reader asks R2's `index.json` first; an unreachable, missing or invalid index, or a named object that cannot be read, falls back to the Firestore chunk read. Never a mix: a reader takes the objects one index names. Rules out reading R2 and Firestore side by side.
- **Item search skips the full snapshot while R2 answers.** `loadPublicContractOffers` returns no rows and the index's `lastSyncedAt`; the board reads the types a search names. A search naming no type (a region or price filter alone) reads every listed type through the index. Rules out a hidden full download running behind every Items board.
- **BPC Sourcing, Blueprint Acquisition and the market-wide scan read only blueprint types** (index types crossed with the SDE's blueprints). Accepted cost: a contract's non-blueprint lines are not read, so a bundle of one blueprint plus ordinary items is no longer flagged `isMultiType` (issue #1076). A bundle of two or more blueprint types still is. The Firestore fallback keeps the exact tally.
- **No CSP exists in the repo,** so no connect-src change; the service worker caches R2 type objects cache-first (immutable, hash in the name) and leaves `index.json` to the Dexie cache.
