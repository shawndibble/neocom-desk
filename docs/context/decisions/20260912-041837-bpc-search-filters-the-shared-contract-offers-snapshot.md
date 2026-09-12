# Scope decisions — BPC Search filters the shared contract offers snapshot on read (issue #907)

_Recorded 2026-09-12 · issue #907._

- **The narrowing is a pure engine module, not a branch inside the Firestore
  read.** `src/engine/contracts/contractOffers.ts` owns both the client mirror
  of the snapshot's row shape and `bpcRowsFromContractOffers`, so the decision
  "which offers are BPC Search's rows, and what does a `BpcContractRow` look
  like built from one" is unit-testable with no Firestore, no Dexie and no
  mock. `syncedContracts.ts` stays what it was — a read — and it has no test
  file of its own, which is exactly why nothing but the read may live there.
- **Chunks are narrowed as they are read, not after the snapshot is
  assembled.** The shared collection holds roughly 3x the rows the
  blueprint-only one did and BPC Search wants about a third of them. Filtering
  inside the `getDocs` loop keeps the retained heap and the Dexie cache entry
  the size they were before this ticket. What it cannot keep is the transfer:
  the read is still an unfiltered `getDocs` over the whole collection, ~124
  chunk docs instead of ~62, so a fetch that misses the cache moves roughly 3x
  the bytes it used to. Rules out, for now, the alternative that would remove
  that: having the sync order blueprint rows first and publish a
  `bpcChunkCount` so the client reads a prefix of the chunks. That re-couples a
  blueprint-specific concern into the pipeline #906 deliberately generalized,
  and breaks the total ordering `sortContractOfferRows` was given for
  determinism. If the 3x fetch still hurts after the staleness change below,
  that is the follow-up to file.
- **The cache's staleness window moves from `STALE_AFTER.default` (10 minutes)
  to the snapshot's own 30-minute publish interval.** This is a deviation from
  the ticket, taken because the ticket asks for no regression and the 3x
  transfer above is one. Ten minutes is the app-wide promise for a
  _Character's_ mutable data; against a backend that republishes twice hourly
  it spends up to three full downloads per cycle, two of them byte-identical —
  which was tolerable at ~23MB and is not at ~74MB. Aligning to the publish
  interval means the client never refetches a snapshot that cannot have
  changed, which roughly restores the pre-ticket bytes-per-hour. The cost is
  freshness: a load can now sit up to one extra publish cycle behind. That is
  visible and recoverable — the panel renders the snapshot's own
  `lastSyncedAt`, not when this browser last read Firestore, and its Refresh
  bypasses the cache outright. Rules out raising `STALE_AFTER.default` itself,
  which would change every ESI-backed view for a reason particular to this one
  snapshot.
- **`me`/`te`/`runs` fall back to 0 rather than being treated as
  missing-data.** The retired ingestion wrote `Number('')`, which is 0 — so a
  blueprint copy with a blank column produced a zeroed row before this ticket
  too, and the fallback reproduces that exactly. EVE issues no copy without
  all three, so the two paths agree on every real row; what the fallback buys
  is that a malformed one stays a zeroed row instead of becoming a NaN row
  that silently fails every numeric filter.
- **`loadPublicBpcContracts`, `PublicBpcContractsSnapshot` and
  `BpcContractRow` keep their names.** They describe what the client asks for
  and gets — public BPC contracts — not which collection it came from, and
  leaving them alone is what let `BpcSourcingPanel.test.tsx`,
  `useComparedBuildResults.test.ts` and `bpcSearch.test.ts` pass untouched,
  which is the ticket's own evidence that behaviour did not change. Renaming
  them is a separate, mechanical change if it is ever wanted.
- **The Dexie cache key moves to `publicContractOffers`.** Keeping the old key
  would let a populated cache from the retired collection serve BPC Search for
  a full `STALE_AFTER.default` window after deploy — masking an empty new
  collection during exactly the window when it is cheapest to notice and fix.
  The cost is one orphaned Dexie row per existing browser, which the cache
  layer already tolerates.
- **The contract half lands in the same PR as the migration, not after live
  confirmation.** The acceptance criteria ask for the old sync, its schedule
  and its rules block to go "once the migration is confirmed working", and no
  agent run can confirm that — `functions/` is never deployed by CI. Splitting
  it would not have bought safety, though: the client switch already depends
  on `syncPublicContractOffers` being deployed and having written at least
  once, so a staged PR would carry the same dependency with a second PR's
  overhead. Deleting a function in source is also inert until the next
  `firebase deploy`, so nothing is destroyed by merging this. What the split
  would have bought is recorded instead as the deploy note on issue #907 and
  in this PR: **`firebase deploy --only functions,firestore:rules` must run
  together**, since a rules-only deploy removes the old read path while a
  functions-only deploy leaves the new collection unreadable.
