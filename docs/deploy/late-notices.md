# Deploying Late notices (decision 20261120-235011, step 2)

Dev and production share one Firebase project and its data, and neither the rules nor the
Cloud Functions are deployed by CI. Every step is additive: older open tabs and the functions
deployed now keep working at each point, so the steps can run before the PR merges.

## What changes

- **Firestore rules:** three new collections under `corps/{id}`, none client-writable.
  - `lateNotices/{noticeId}`: officers read every one; a Miner reads their own (`uids`).
  - `lateNoticeLinks/{noticeId}`: `{ token }`, editors only (as `statementLinks`).
  - `accountCheckpoints/{minerId}`: officers read every one; a Miner reads their own (`uids`).
- **Indexes:** none. Every new query is on a single field (`minerId`, `characterIds`,
  `issuedAt`, `extractionId`, `chunkArrivalTime`).
- **Functions:**
  - `corpTaxBookCall` (the book's router): `issueLateNotice`, `recordLateNoticeMail` and
    `recordCheckpoints` edits; Late notices written beside their `statements` mirror; the verify
    page, Stop reminders and declarations read `lateNotices` first; write-offs pin no notice.
  - `syncCorpTaxBooks` (scheduled sync): donations matched on each Miner's code and every
    notice's.
  - `dailyHousekeeping` (job `verifyBookDocs`): the nightly pass rebuilds moon docs (schema 2, no
    frozen tax) and the tab read models (schema 2, from recorded accounts), and deletes the
    retired `minerTotals` docs.
  - Other functions share the same store code (moon owner notifications refresh moon docs and
    read models), so deploy every function rather than a list.

## Order

1. **Rules first**, so a client can read the new collections the moment anything writes them:

   ```sh
   firebase deploy --only firestore:rules
   ```

2. **Functions**, which start writing `lateNotices` (and still mirror every notice to
   `statements`/`statementLinks`, so older tabs keep reading them):

   ```sh
   firebase deploy --only functions
   ```

3. **Backfill**, once the functions are live (a notice issued before step 2 exists only in
   `statements`). Count first, then copy. It is create-only, so it can run again safely; a batch
   that meets a notice issued during the run fails, and a re-run copies what is left.

   ```sh
   cd functions && npm run build
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId> --dry-run
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId>
   ```

   Add corporation ids after the project id to run only those books.

4. **The client** that reads `lateNotices` ships after step 3. Until then a verify link, a mail
   or a declaration on a notice the backfill has not reached still works: the functions fall
   back to its `statements` doc.

## After deploy

- The first nightly pass rewrites every moon doc and both read models (new schemas) and deletes
  `minerTotals` and `meta/minerTotalsHealth`; its result is in `meta/verifierHealth`.
- Rolling the functions back is safe: notices are still mirrored to `statements`, and verify
  tokens still name their notice under `statementId`.
