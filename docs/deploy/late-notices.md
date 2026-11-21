# Deploying the Running account and Late notices (decision 20261120-235011)

Dev and production share one Firebase project and its data, and neither the rules nor the
Cloud Functions are deployed by CI. Older clients are not supported (decision
20261121-154806): the rules, the indexes and the functions deploy together with this change, and
an open tab older than it must be reloaded.

## What changes

- **Firestore rules:**
  - `lateNotices/{noticeId}`: officers read every one; a Miner reads their own (`uids`).
  - `lateNoticeLinks/{noticeId}`: `{ token }`, editors only.
  - `accounts/{minerId}`: a Miner's Running account figures and its `snapshot` for the lock
    date. Officers read every one; a Miner reads their own once it holds a snapshot (`uids`).
    A figures-only write doesn't move the book's `accounts` version (only a snapshot does).
  - `observed` and `payments` read by their own Character (`uid`) only, as before this feature:
    no copied readers (`uids`) on either. A pilot sees an alt's lines through the character
    selector.
  - `statements` and `statementLinks` have no rule any more: no client reads them. Only the
    one-time copy (admin SDK) reads them.
  - Under `users/{uid}`, a pilot's own `miningTaxPaymentLinks/{linkId}` (a Made Payment's link
    to one Payee), with the same owner and hash rules as `miningTaxAssignments`.
- **Indexes:** for the synced `miningTaxPaymentLinks` collection (`ownerHash` + `updatedAt`, and
  its single-field `ownerHash` override), the same pair every synced collection has. Every other
  Corp Tax Book query is on a single field.
- **Functions:**
  - `corpTaxBookCall` (the book's router): `issueLateNotice`, `recordLateNoticeMail`, and
    `recordAccounts` taking each Miner's snapshot with its figures; `closeAccount` issues its final notice from `notice`. Notices are
    written to `lateNotices` / `lateNoticeLinks` only, and every read (the verify page, Stop
    reminders, declarations, the date guards) reads only those. `issueStatement`,
    `settleStatements`, `recordMail` and `resetCheckpoint` are gone.
  - **The lock date.** Anything dated before the 1st of the month two months back is read-only:
    a payment recorded or moved, "not tax", an adjustment, a dismissal of a day, a rate or record
    rate, a tolerance exemption, a rebill, a write-off's reversal, and a dispute filed or
    withdrawn are refused with reason `locked`. A correction or a write-off dated today is how
    an old mistake is put right, and an officer still answers an open dispute on a locked day. An officer's tab records one snapshot per Miner per lock date;
    only a change to a Miner's characters deletes it.
  - `syncCorpTaxBooks` (scheduled sync) and every officer sync: the server decides whose money
    each stored donation is (`corpTaxBookDonationMatch.ts`). A donation that matches an unlinked
    hand record from the same sender is linked to it (`transferId`), not stored again. Money is
    placed only on a known, open Miner, and a Miner doc deleted takes its `accounts` doc with it.
    Moving a payment off a Miner, or marking more of it not tax, drops that Miner's recorded
    paid-through day (decision 20261121-093000).
  - `dailyHousekeeping` (job `verifyBookDocs`): the nightly pass rebuilds moon docs (schema 2)
    and the tab read models (schema 2).
  - Other functions share the same store code, so deploy every function rather than a list.

## Order

1. **Rules, indexes and functions**, together, right after the PR merges to `develop`:

   ```sh
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

2. **The one-time copy**, once the functions are live. Count first, then copy. It copies each
   `statements` notice into `lateNotices` and each `statementLinks` token into
   `lateNoticeLinks` where none exists yet, and deletes the retired `minerTotals` docs. Until it
   has run, a notice issued before step 1 is not shown, and its verify link answers "not
   valid". It can run again safely; a book that fails (a notice issued during its run) is
   reported, the run goes on, and the script exits non-zero: re-run it with those corporation ids.

   ```sh
   cd functions && npm run build
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId> --dry-run
   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> node scripts/backfill-late-notices.mjs <projectId>
   ```

   Add corporation ids after the project id to run only those books.

3. **Promote `develop` to `main` straight after.** The production client on `main` is built for
   the old functions; until it is promoted it cannot issue a notice or close an account.

## After deploy

- The first nightly pass rewrites every moon doc and both read models (new schemas); its result
  is in `meta/verifierHealth`.
- A checkpoint the previous code stored through days after the lock date is no snapshot
  (`isSnapshot`): the next officer load records a snapshot over it.
- The `statements` and `statementLinks` docs stay where they are after the copy; nothing reads
  them. A later one-off script may delete them.
- **Rolling the functions back is not supported**: the older functions write only the legacy
  docs, which nothing reads now.
