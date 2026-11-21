# Deploying the Running account and Late notices (decision 20261120-235011)

Dev and production share one Firebase project and its data, and neither the rules nor the
Cloud Functions are deployed by CI. Every step is additive: older open tabs and the functions
deployed now keep working at each point. Run them right after the PR merges to `develop`, in the
order below.

## What changes

- **Firestore rules:** three new collections under `corps/{id}`, none client-writable.
  - `lateNotices/{noticeId}`: officers read every one; a Miner reads their own (`uids`).
  - `lateNoticeLinks/{noticeId}`: `{ token }`, editors only (as `statementLinks`).
  - `accountCheckpoints/{minerId}`: officers read every one; a Miner reads their own (`uids`).
  - `payments/{paymentId}`: also readable by its Miner's readers (`uids`), so a main reads an
    alt's donation. A payment without `uids` still reads by its sender (`uid`) alone.
  - Under `users/{uid}`, a pilot's own `miningTaxPaymentLinks/{linkId}` (a Made Payment's link
    to one Payee), with the same owner and hash rules as `miningTaxAssignments`. Older clients
    never read or write it.
- **Indexes:** for the synced `miningTaxPaymentLinks` collection only (`ownerHash` + `updatedAt`,
  and its single-field `ownerHash` override), the same pair every synced collection has. Corp Tax
  Book queries need none: each is on a single field (`minerId`, `characterIds`, `uids` on
  `payments`, `issuedAt`, `extractionId`, `chunkArrivalTime`, `transferId`, and
  `books.<corporationId>` on `corpTaxBookBilledBy`, indexed as a map field by default).
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
    Every payment write stores `uids`: its Miner's readers and its sender. A grouping, an unlink
    and a promoted claim bring its Miner's payments' `uids` level with who reads the Miner.
  - `dailyHousekeeping` (job `verifyBookDocs`): the nightly pass rebuilds moon docs (schema 2, no
    frozen tax) and the Overview read model (schema 2, its Extractions alone), and deletes the
    retired `minerTotals` docs and `readModels/minerList` doc (nothing reads it).
  - A rate refused on a day a Late notice listed still answers `day-on-statement`, which every
    client matches; a correction a notice listed answers `billed-on-notice` (was
    `billed-on-statement`, which no client matched). The date guards read the days a notice
    listed, never the days between its first and last line.
  - Other functions share the same store code (moon owner notifications refresh moon docs and
    the Overview read model), so deploy every function rather than a list.

## Order

**Step 1 runs before the merge.** The rules and indexes are additive, and a pilot's payment
links can only sync once the rules know their collection.

Merging the PR to `develop` ships the new client to `https://dev.neocomdesk.com` straight away,
before anything below. That is safe: against the functions deployed now it falls back to the old
actions (`issueStatement`, `recordMail`) and reads the legacy `statements` docs beside
`lateNotices`. A pilot's payment links stay on their device until the rules allow syncing them
(step 1), and sync once they do.

1. **Rules and indexes**, so a client can read and sync the new collections the moment anything
   writes them. Indexes build in the background; the client works while they do.

   ```sh
   firebase deploy --only firestore:rules,firestore:indexes
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
   the ids of its legacy docs and fetches those with no copy. It also gives each payment stored
   without `uids` its Miner's readers and its sender (`payment readers` in its output); until it
   has, a main does not see an alt's older donations. It can run again safely; a book that fails
   (a notice issued, or a payment written, during its run) is reported, the run goes on, and the
   script exits non-zero: re-run it with those corporation ids.

   ```sh
   cd functions && npm run build
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId> --dry-run
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId>
   ```

   Add corporation ids after the project id to run only those books.

4. **Promote `develop` to `main` straight after.** The production client on `main` is built for
   the old schemas (moon docs and read models schema 1): from step 2 it ignores the rebuilt docs
   and reads the whole book instead. Its figures stay correct, only slower, until it is promoted.

## After deploy

- The first nightly pass rewrites every moon doc and the Overview read model (new schemas) and
  deletes `minerTotals`, `meta/minerTotalsHealth` and `readModels/minerList`; its result is in
  `meta/verifierHealth`.
- **Rolling the functions back is not free.** Verify links keep working (every notice is
  mirrored to `statements`, and tokens still name it under `statementId`), but the older
  functions write only the legacy docs: a notice issued or a mail recorded while rolled back
  lands only in `statements`. They also write `minerTotals` and schema-1 moon docs and read
  models again. After rolling forward again:
  - delete every `corps/{id}/meta/lateNoticesBackfilled` doc, or a marked book's list reads
    (codes, the date guards, the notice cooldown) miss the notices issued meanwhile;
  - re-run the backfill (step 3): it copies those notices and brings their mail state across
    (until then the verify page and mail already read both docs and merge their mail state), and
    gives the payments written meanwhile their `uids`;
  - the next nightly pass rewrites the moon docs and the Overview read model and deletes
    `minerTotals` and `readModels/minerList`.
- An older tab that still issues a calendar Statement is refused on every book (the backfill
  lists the books with no `runningAccountFrom`, whose older tabs see that refusal).

## After the soak (step 5)

The soak ends once production runs this client and no tab older than it can still be open: about
a week after promotion. Then a follow-up PR removes the legacy half, each in one place:

- **Server writes:** `corpTaxBookLegacyMirror.ts` (every `statements` / `statementLinks` write), and
  the legacy actions it serves: `issueStatement`, `settleStatements`, `recordMail` with kind
  `'statement'`, `closeAccount`'s `statement` field, `parseStatement` / `StoredStatement`,
  `switchToRunningAccount`, `refuseCalendarStatement`.
- **Server reads:** the fallback to `statements` / `statementLinks` in the Late notice store and
  the verify page, the `meta/lateNoticesBackfilled` marker, and the quiet-run stamp on `statements`
  (swap in `lateNotices`).
- **Settings fields** `cadence`, `minimumStatement` and `overdueDays`, still accepted from old tabs,
  still in `BOOK_DEFAULTS` and still sent in the verify page's `terms`.
- **Wire names:** the rate refusal answers `day-on-notice` instead of `day-on-statement` (the
  `DAY_ON_NOTICE` constant in `corpTaxBookStore.ts`), once every client accepts both.
- **Client fallbacks:** `issueLateNotice` → `issueStatement`, `recordLateNoticeMail` →
  `recordMail`, the unknown-action branch of `recordCheckpoints`, the legacy `statements` read in
  `readNotices`, the `statementLinks` token read, and `LEGACY_NOTICES` / `LEGACY_NOTICE_LINKS` /
  `LEGACY_NOTICE_MAIL_KIND`. The `/corp/moons/statements` and `?statement=` redirects can stay: old
  links in sent mail use them.
- **Rules:** the `statements` and `statementLinks` blocks. Then delete those collections' docs with
  a one-off script (after a final backfill).
- **Pilot side:** reading the old Assignment paid marks into links (`legacyPaidMarks.ts`), once
  every device has run this client; the stored `status`, `payment` and `paidAt` fields can then be
  dropped from new writes' readers.
- **Kept on purpose:** the verify wire field `statement` and the callable name
  `readCorpTaxBookStatementCallable` (links in mail already sent call them), and the `statementId`
  index of the device mail queue.
