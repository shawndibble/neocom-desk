# Scope decisions — The daily public snapshots live in R2, not Firestore

_Recorded 2026-10-18. Applies ADR 0019 to two more snapshots; supersedes the
storage of `20261018-164126-open-prices-one-document-per-type-every-hub.md` (the
layout of one object per type, every hub region in it, stands) and the Firestore
storage named in `20261009-000246-lp-store-is-a-market-tab-with-an.md`._

- **LP Store offers: one R2 object, `lp-store-offers/snapshot.json`**, gzip,
  `{ lastSyncedAt, rows }` (the rows are the same corporation rows the Firestore
  chunks carried). `syncLpStoreOffers` uploads it after the same "lost more than a
  tenth of the corporations publishes nothing" guard. `Cache-Control: public,
max-age=300`: a fixed name rewritten once a day, not content-addressed. The
  page reads it with no Firebase session and a 12-hour cache window.
- **Open prices: `open-prices/<typeId>.json`**, gzip, the same
  `{ typeId, dates, regions }` body, `Cache-Control: public, max-age=3600`.
  `syncMarketOpenPrices` and the backfill read each type's object, merge the new
  day (`mergeDays`) and write it back, 32 at a time. A type that fails makes the
  run throw (Cloud Scheduler retries it; the merge is idempotent) and the
  shrink-guard meta doc (`marketOpenPricesMeta/lastRun`, admin-only) is written
  only after a complete day. The meta doc is the one piece that stays in
  Firestore.
- **Why now:** both are public, server-written, read-many and whole-object, the
  shape ADR 0019 moved the contract snapshots for, and neither collection is in the
  production Firestore console, so there is no migration. R2 has no egress fee and
  the Firestore rules, read ops and rewrites of ~20,000 documents a day go away.
- **Operation budget to watch:** the daily open-prices run is ~20,000 Class A
  (write) operations and ~20,000 Class B (read) ones, ~600k writes a month
  against R2's free 1M, shared with the contract publishers (ADR 0019's
  consequences). If the combined total nears the free tier, publish only the
  types whose newest day changed or move reads of existing objects to the public
  domain.
- **Bucket rule:** the R2 lifecycle rule that deletes superseded contract
  objects must be scoped to `contract-offers/` and `courier-contracts/`. The two
  new prefixes are mutable and an untraded type's open-price history must not
  expire.
- **Firestore rules and data:** the `lpStoreOffers` and `marketOpenPricesByType`
  rules are removed (the implicit deny covers anything left behind). If either
  collection exists in the production project it is now orphaned and can be
  deleted.
- **No client fallback to Firestore.** Unlike the contract snapshots (which kept
  one until R2 had run in production), neither collection is in the production
  console, so there is nothing to fall back to.
