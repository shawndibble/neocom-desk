# Scope decisions — Open prices: one document per type, every hub region in it

_Recorded 2026-10-18. Supersedes the **Layout** bullet of
`20261018-121126-price-history-draws-daily-open-buy-and-sell.md`; the rest of
that decision stands._

- **Collection `marketOpenPricesByType`, document id `<typeId>`, holding all
  five Trade Hub regions.** Fields: `typeId`, `dates` (ascending unique
  `YYYY-MM-DD`, shared by every region, newest 400 kept) and `regions`, a map
  from region id to `{ buy, sell }`, each an array parallel to `dates` with a
  price or `null`. Firestore forbids arrays of arrays, hence the map of
  parallel arrays. The per-region layout had ~70,000 documents, so a day's run
  and the backfill each read and rewrote 70,000 documents; per type it is
  ~20,000, and the history panel, which shows the primary region and up to four
  compared ones, needs one read instead of one per region.
- **Gaps keep their meaning.** A date is in `dates` only when some region had a
  price that day; a region with no order on a side that day reads `null`
  there, the same as a side with no order did before. The chart already drops a
  day with neither price, so a region that did not list the type that day draws
  a gap. A region with no price left in the kept days is dropped from the map.
  Merging replaces a whole date, every region with it, so re-running a day stays
  idempotent.
- **Size:** at 400 days x 5 regions a document is ~37 KB by Firestore's size
  rules (dates ~4.4 KB, 4,000 prices x 8 bytes), far under the 1 MiB limit.
  Writes go in batches of 100 so a commit stays well under the 10 MiB request
  limit.
- **A compared region outside the five has no open series** and keeps its ESI
  average line, as before.
- **The old `marketOpenPrices` collection is dropped**, not migrated: it held
  only part of a backfill, which is re-run into the new collection. Its rule is
  removed; nothing reads it. A stale PWA bundle still asking for the old path
  gets permission-denied, which the loader already treats as "no series": the
  chart shows its ESI average line until the app updates. `marketOpenPricesMeta/lastRun` keeps its meaning
  (priced types per region of the last published day), so the shrink guard
  needs no reset.
- **The backfill writes each document once.** It folds every day first, keeping
  only two Float64Arrays (buy, sell) per day indexed by region/type pair
  (~16 bytes per pair per day, ~450 MB for 400 days), then runs one merge-write
  pass. The merge keeps any stored day outside the backfilled range (the daily
  job's), replacing a day inside it with the same snapshot's prices.
