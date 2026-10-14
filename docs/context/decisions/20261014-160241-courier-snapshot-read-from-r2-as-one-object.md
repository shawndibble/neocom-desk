# Scope decisions — Courier snapshot read from R2 as one object, Firestore as fallback (issue #3748)

_Recorded 2026-10-14 · issue #3748._

- **One content-addressed object for the whole courier snapshot, not one per route or region.** The snapshot is under ~620 rows (ADR 0013's live pull), a few tens of KB gzipped; splitting it would add requests and an index with nothing to save. `courier-contracts/rows.<hash>.json` plus `courier-contracts/index.json` (`lastSyncedAt`, `count`, `object`). Rules out per-type-style sharding and any region filter at the reader.
- **Same headers, writer rules and fallback as the offers snapshot.** Object immutable and gzip-encoded, index `max-age=60`, uploaded only when its hash changed or every two days (lifecycle refresh), index held back if the upload fails, an R2 failure never fails the Firestore publish. The Courier tab reads R2 first and falls back to the Firestore chunk whole on any failure (blocked, 404, bad index, bad rows); never a mix.
- **Firestore courier write stays** until the R2 path has run in production, as with offers.
