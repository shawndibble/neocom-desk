# Scope decisions — Mining prices from the open-prices job (issue #4277)

_Recorded 2026-10-18 · issue #4277. Supersedes
20260925-233210-server-side-mining-price-snapshot-fuzzwork-6h-capture._

> Partly superseded by 20261019-091155-mining-prices-read-the-open-prices:
> the mining pages read `open-prices/<typeId>.json`; the `mining-prices/` month
> objects, their migration and their client read are retired.

- **`captureMiningPriceSnapshot` is retired; `syncMarketOpenPrices` produces
  the mining prices.** The open-prices job already streams EVE Ref's final
  daily order snapshot once a day, and that file holds every order for every
  mining type. A second job reading Fuzzwork every 6 hours bought nothing the
  snapshot lacks. The station fold (`functions/src/miningHubPrices.ts`) rides
  the same single pass over the download (`marketOrdersArchive.ts` feeds both
  folds from each row), so the 540 s job gains only a few R2 round trips, not
  a second download. The deployment drops to ten scheduled functions.
- **Station level, not region level.** Billing names a station ("Jita 4-4
  sell"), so the fold keeps the highest buy and lowest sell among orders whose
  `location_id` is the hub station, for the 555 `MINING_TYPE_IDS`. A side with
  no order is `null`; a type with neither side is left out; a hub with no
  priced type at all writes no day.
- **A buy order's `range` is ignored.** A region- or system-range buy order
  placed elsewhere does not count as a station buy, even though it would fill
  an order sold at the hub. This matches Fuzzwork's station aggregate, which
  groups orders by the station they are placed in and which the retired job
  read, and the repo's own rule (`orderBook.ts`'s `filterOrdersByLocation`,
  decision 20260929-235337). A range buy placed _at_ the station counts.
- **R2 layout: one object per hub per month.**
  `mining-prices/<hubId>/<YYYY-MM>.json`, gzip, `max-age=3600`, shaped
  `{ hub, month, days: { <date>: { tier, prices: { <typeId>: [buy, sell] } } } }`.
  The readers (`hubSnapshot.ts` → `pricing.ts`, `yieldSnapshot.ts`) ask for
  a date range of every mining type at one hub, so a month object is what one
  read needs: ~150 KB gzip, one or two per typical range. Never one object for
  everything; never one per type. Merge-on-write like the open prices: read,
  replace the day whole (idempotent), write. 400 days kept, to month
  granularity: a rewritten month drops days before the window, and the two
  month objects wholly before it are deleted each run (a missing key is a
  no-op; a failed delete is logged and retried next run). The month holding
  the window's start keeps its older days until it is deleted about a month
  later, so up to ~430 days can be stored; readers filter by date anyway. The prefix is mutable, so the R2 lifecycle rule must not
  cover it.
- **The `saved` tier is now the end-of-day price, not a day average.** The
  old job folded up to four Fuzzwork captures into a running mean for the
  day; the new day is the book standing at ~23:45 UTC. Moon Mining Tax and
  Corp Tax Book amounts for days published from now on can differ slightly
  from what the old average would have given. Already-billed Statements keep
  their stored amounts: nothing here reprices them. Older days keep their
  migrated values.
- **One-time migration, no maintainer script.** While
  `mining-prices/migrated.json` is missing, the daily run reads the whole
  `marketHistory` collection (≤90 days) and folds it into the month objects
  in the same writes: 'fuzzwork' days keep the `saved` tier, 'adam4eve'
  (Jita, region-wide) days keep `historical`. The fold's own day wins a date
  both hold. The marker is written only after every object landed, so a
  failed run copies again on retry. After that the collection is never read
  and the maintainer deletes it.
- **A day the open-prices guards skip has no Hub Station Price either.**
  When `implausibleReason` or `shrunkRegion` stops a run, nothing is
  published for that day, mining included, and the tier chain falls back
  (live buy / sell for Tax). The open-prices backfill script does not pass a
  station fold, so it does not fill those days; adding that is a later change
  if such gaps show up. The old Adam4EVE gap-fill is gone with the job.
- **The client reads R2 directly.** `loadHubSnapshotRange` fetches the month
  objects the range touches from `data.neocomdesk.com`: no Firebase session,
  no Firestore read, and no `characterId` (dropped from the pricing API, which
  only needed it to sign in). A missing month (404), a failed read or a
  malformed object all read as no days; only good answers are held, for an
  hour. The `marketHistory` rule is removed; the `marketHistory:` esiCache
  prune rule stays so rows a browser already holds still age out.
