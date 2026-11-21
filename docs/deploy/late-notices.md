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
  `issuedAt`, `extractionId`, `chunkArrivalTime`, `transferId`, and `books.<corporationId>` on
  `corpTaxBookBilledBy`, which Firestore indexes as a map field by default).
- **Functions:**
  - `corpTaxBookCall` (the book's router): `issueLateNotice`, `recordLateNoticeMail`,
    `recordCheckpoints` and `resetCheckpoint` edits; Late notices written beside their
    `statements` mirror; the verify page, Stop reminders and declarations read `lateNotices`
    first; a write-off pins no notice, and an older tab's write-off that names one is refused
    with "reload the page".
  - `syncCorpTaxBooks` (scheduled sync) and every officer sync: the server decides whose money
    each stored donation is (`corpTaxBookDonationMatch.ts`), ignoring a client's Miner or notice:
    a grouped sender, or one seen mining what the book bills, pays their own Miner (the earliest
    grouping); a stranger is named by a Miner's or a notice's code, else by the Miner their earlier
    payments named; one that could be two Miners' is stored for review (`reviewReason:
'ambiguous'`). A hand record of a transfer the book already holds is refused; one noted in an
    unread division is linked to it and never counted again. `reassignPayment` moves a payment.
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
   `statements`). Count first, then copy. It creates missing copies, brings each existing copy's
   mail state level with its legacy doc, and then marks the book (`meta/lateNoticesBackfilled`):
   from then on reads look at `lateNotices` alone. Until a book is marked, every read also reads
   the ids of its legacy docs and fetches those with no copy. It can run again safely; a book
   that fails (a notice issued during its run) is reported, the run goes on, and the script exits
   non-zero: re-run it with those corporation ids.

   ```sh
   cd functions && npm run build
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId> --dry-run
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId>
   ```

   Add corporation ids after the project id to run only those books.

4. **The client** that reads `lateNotices` ships after step 3. Until then a verify link, a mail
   or a declaration on a notice the backfill has not reached still works: the functions fall
   back to its `statements` doc.

5. **Promote `develop` to `main` soon after step 2.** The production client on `main` is built
   for the old schemas (moon docs and read models schema 1): from step 2 it ignores the rebuilt
   docs and reads the whole book instead. Its figures stay correct, only slower, until it is
   promoted.

## After deploy

- The first nightly pass rewrites every moon doc and both read models (new schemas) and deletes
  `minerTotals` and `meta/minerTotalsHealth`; its result is in `meta/verifierHealth`.
- **Rolling the functions back is not free.** Verify links keep working (every notice is
  mirrored to `statements`, and tokens still name it under `statementId`), but the older
  functions write only the legacy docs: a notice issued or a mail recorded while rolled back
  lands only in `statements`. They also write `minerTotals` and schema-1 moon docs and read
  models again. After rolling forward again:
  - delete every `corps/{id}/meta/lateNoticesBackfilled` doc, or a marked book's list reads
    (the Miners list, codes, guards) miss the notices issued meanwhile;
  - re-run the backfill (step 3): it copies those notices and brings their mail state across
    (until then the verify page and mail already read both docs and merge their mail state);
  - the next nightly pass rewrites the moon docs and read models and deletes `minerTotals`.
- An older tab that still issues a calendar Statement on a book that never switched removes the
  book's backfilled marker, so reads look at the legacy docs again until the next backfill.
