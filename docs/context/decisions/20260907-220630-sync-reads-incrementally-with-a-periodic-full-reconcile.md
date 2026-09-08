# Scope decisions — Sync reads incrementally, with a periodic full reconcile (issue #581)

_Recorded 2026-09-07 · issue #581._

- **A sync pass reads only what changed since its last pass.** Each (Character,
  collection) pair carries a **Pull Cursor** and the remote read is filtered to
  `ownerHash == h AND updatedAt > cursor`. Firestore bills per document read,
  so the old full scan of all 12 collections — on app start, on every Character
  switch, and 2s after every mutation — cost the product of users, mutations
  and accumulated rows, while the stored data barely moved. This rules out
  treating remote absence as "the remote side has never seen this row".
- **The Pull Cursor is the highest `updatedAt` actually observed, never
  `Date.now()`.** A document written while a pass is in flight, under a clock
  that has already run past it, must be picked up by the next pass rather than
  skipped. This rules out stamping the cursor from the wall clock, however much
  simpler that reads.
- **The cursor records its last full read (`fullAt`) separately from its
  high-water mark (`high`), and a full read is forced once `fullAt` is older
  than `TOMBSTONE_TTL_MS`.** The ticket described the fallback as "cursor older
  than the TTL", but `high` is a property of the data, not of this device: on a
  collection nothing has touched in a year, `high` stays a year old and every
  pass would degrade back to a full scan. `fullAt` bounds full reconciles to
  one per collection per 30 days regardless of how quiet the data is.
- **A local tombstone with no matching remote doc is pushed, not cleared,
  during an incremental pass.** A live remote copy at or below the cursor is
  invisible to the window, so clearing on that unprovable absence would let the
  next pass pull the row back. The cost is a remote tombstone doc for a row
  that may never have existed remotely; it is TTL-purged like any other. This
  rules out sharing the full-read "nothing remote to delete" shortcut.
- **`purgeRemote` is housekeeping for the full-read path only.** An expired
  tombstone is below every live cursor by definition, so an incremental window
  never sees one. The 30-day full reconcile is what keeps the purge running;
  this rules out a separate purge schedule.
- **The Notification Feed doc carries a plain `updatedAt` as a transport
  field.** `mergeFeed` keys on `firedAt`/`dismissedAt` and continues to — but a
  dismissal does not move `firedAt`, so a `firedAt` cursor would silently drop
  dismissals. The transport stamp is `max(firedAt, dismissedAt)`, derived
  rather than wall-clocked so the value a device compares locally is the value
  it wrote remotely. It is never a merge input: a later sighting must still not
  re-date a row.
- **The synced `settings` collection stays a full read.** Its tombstones never
  expire and `mergeSettings`' absence semantics differ from `mergeRecords`', and
  the synced-key allow-list already bounds its document count — it is the
  cheapest of the 12 scans. This rules out cursoring all 12 collections
  uniformly for now.
- **A missing composite index degrades to the old full read rather than
  failing the pass.** `firestore.indexes.json` is deployed by hand, so a client
  can ship ahead of its indexes; Firestore answers such a query with
  `failed-precondition`. Catching that and re-reading unfiltered makes the
  deploy order irrelevant and the rollout self-healing. This rules out gating
  the release on the index deploy.
- **The cursor is written last, only after every push and local write in the
  pass has landed.** A pass that throws must leave the cursor where it was, so
  the next one re-reads the same window.
