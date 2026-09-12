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
  the size they were before this ticket; only the network transfer is ~3x, and
  only on a cold or stale load. That transient is the accepted cost of the
  migration. Rules out, for now, the alternative that would remove it: having
  the sync order blueprint rows first and publish a `bpcChunkCount` so the
  client reads a prefix of the chunks. That re-couples a blueprint-specific
  concern into the pipeline #906 deliberately generalized, and breaks the
  total ordering `sortContractOfferRows` was given for determinism. If the 3x
  fetch turns out to hurt in practice, that is the follow-up to file.
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
