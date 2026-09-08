# Scope decisions — the feed expires server-side by scheduled purge, not TTL (issue #595)

_Recorded 2026-09-07 · issue #595._

- **A scheduled purge, not a Firestore TTL policy.** TTL is cheaper to run —
  Firestore deletes the docs itself, with no function invocations — but it
  needs a real `Timestamp` field and `firedAt` is epoch ms. Adopting it would
  mean a second field (`expiresAt`) written by `toRemoteFeedDoc`, and a TTL
  policy ignores a doc whose field is missing or the wrong type, so every row
  already up there would be exempt forever. The accounts this ticket exists
  for are precisely the ones that will never write that field, because nothing
  signs in as them again. TTL cannot expire the rows that motivated the work,
  so it was rejected. This rules out reading the remote feed's expiry as a
  Firestore-native property of the documents.
- **One collection-group query, not an enumeration of accounts.**
  `purgeNotificationFeed` (`functions/src/index.ts`) queries the
  `notificationFeed` _collection group_, so a single pass reaches every
  `characters/{uid}/notificationFeed` without listing uids or holding a
  registry of accounts. That is what makes "an account nobody signs into" cost
  the same as any other. It needs a `COLLECTION_GROUP`-scoped index on
  `firedAt`, declared under `fieldOverrides` in `firestore.indexes.json`; a
  field override replaces the automatic single-field indexes for that path, so
  the ordinary `COLLECTION`-scoped entries are spelled out alongside it rather
  than left implicit. This rules out a purge that needs to know who the
  account holders are.
- **Daily, and bounded per run.** The retention is 30 days, so the tick only
  has to be small against that — every 24 hours, not the dispatcher's 5
  minutes. Each run deletes in batches of `FEED_PURGE_BATCH_SIZE` (500,
  Firestore's write-batch cap) for at most `FEED_PURGE_MAX_PASSES` (20)
  passes, so one invocation clears up to 10,000 rows and a larger backlog
  continues on the next tick rather than spinning. This rules out reading the
  purge as instantaneous on any particular row.
- **Rows already in the collection are covered, within a day or so of
  deploy.** Nothing about the query depends on a field this change introduces
  — it filters on `firedAt`, which every row has carried since the collection
  existed (`NotificationFeedRecord.firedAt` is required, and `toRemoteFeedDoc`
  has always written it). So the first run after deployment sweeps the
  existing backlog on the same terms as anything written later; only its
  _size_ decides whether that takes one tick or several. This is the AC3
  answer, and it is the concrete reason the TTL shape was not worth its lower
  running cost.
- **One retention number on the backend, and a noted twin on the client.**
  The purge reuses `FIRED_RETENTION_MS` from
  `functions/src/dispatchProjections.ts` rather than declaring its own — the
  same 30 days already applied to fired Projection rows. The client's
  `FEED_SYNC_WINDOW_MS` is deliberately the same value, but `functions/` is a
  separate package that cannot import from `src/`, so the two are held equal
  by a comment at each declaration rather than by a shared module. A shared
  package for one number is not worth its own build. This rules out treating
  either constant as independently tunable.
- **Belt-and-braces, not a replacement.** `mergeFeed`'s `purgeRemote` stays
  exactly as #582 shipped it. The client rule is not only about size: it is
  what stops the pull churn of a device repeatedly re-reading rows it has
  aged out locally, which a server-side sweep running once a day would not
  address. Two rules covering the same collection is the intent here, not
  duplication to be collapsed later.
- **Merging this does not activate it.** CI deploys GitHub Pages only; the
  Cloud Functions and Firestore indexes are deployed by hand. The order
  matters — `firebase deploy --only firestore:indexes` first and let the
  collection-group index finish building, then
  `firebase deploy --only functions`. Run the other way round, the first tick
  fails `FAILED_PRECONDITION` until the index exists. This also adds a second
  Cloud Scheduler job to the deployment, where `dispatchProjections` used to
  be the only one.
