# 0025 — Scheduled Corp Tax Book sync under a narrow, opt-in corp grant

## Status

Accepted (2026-10-19). Amends ADR 0023's "Sync stays client-driven" and
scope decision D25 ("no server-side scheduled sync in v1"). Builds on ADR 0020.

## Context

ADR 0023 left the Corp Tax Book's sync to whichever officer opens the page. The
book is only as fresh as the last visit, ESI's observer ledger keeps a short
window of history (gaps are lost for good), and a miner's donation is not
matched or a Statement settled until an officer happens to visit. ADR 0023
named the way out: "revisited only as a CEO opt-in narrow grant, as ADR 0020 did
for alerts". The maintainer decided to build it (issue #4068), with any book
editor able to opt in.

The costs ADR 0010 and ADR 0020 weighed are the same here: a refresh token on a
server reverses ADR 0001, SSO rotates refresh tokens so a device and a server
cannot share one, and encrypted storage, revocation and the ESI error budget
become the backend's problem. ADR 0020 already built every piece this needs.

## Decision

Add an opt-in **Corp Sync Grant** and a scheduled function, `syncCorpTaxBooks`,
that syncs and settles each opted-in corporation's book every 6 hours.

- **Who and how many.** Any book editor (CEO, Director or Accountant) opts in
  for their own Character, from the book's settings ("Automatic sync"). One
  holder per corporation: a new opt-in replaces the previous one and revokes its
  token. The holder can revoke their own grant; the CEO can revoke anyone's
  (a live role check, as for the book's other CEO-only acts).
- **A separate SSO authorization, device untouched.** The browser runs a second
  PKCE round trip with only the grant's scopes. The callback never stores that
  token on the device (it takes the same path as the Alerts Grant round trip,
  `intent` on the pending login) and hands both tokens to a callable. The
  callable proves the refresh token is live and the Character's by redeeming it
  at SSO, stores the rotated one, and reads the holder's corporation and roles
  with it before accepting.
- **Scopes (exactly these, all required):**
  `esi-industry.read_corporation_mining.v1` (observer ledger, Extractions),
  `esi-wallet.read_corporation_wallets.v1` (wallet journal donations),
  `esi-characters.read_notifications.v1` (moon notifications),
  `esi-characters.read_corporation_roles.v1` (the per-run role re-check) and
  `esi-universe.read_structures.v1` (a refinery's solar system, so scheduled
  rows keep the system an officer's visit set). Not mail, not assets, not
  skills. A leaked grant token can read a corporation's refinery ledger,
  wallet journal and one Character's notifications, and the Character's roles;
  it cannot send mail, move ISK or read anything else.
- **Custody.** `corpTaxBookSyncGrants/{corporationId}`, function-only
  (`firestore.rules` denies every client, the holder included). The refresh
  token is AES-256-GCM under the existing `ALERTS_TOKEN_KEY` secret, with its
  additional authenticated data bound to a `corpSyncGrant` purpose and the
  Character, so a blob copied between the Alerts and corp grant collections does
  not decrypt. No new secret. Every refresh writes the rotated token back in a
  transaction guarded on the blob it read. No access token is persisted; nothing
  is logged or sent to a client.
- **What officers may see** is `corpTaxBooks/{corp}/meta/scheduledSync`
  (officer-readable, function-written): the holder, `active` or `stopped`, why,
  and the last run. No token, ever.
- **What a run does.** It refreshes and rotates the token, re-reads the holder's
  roles and corporation with it, then runs the officer visit's pipeline through
  the same `syncBookAs`/`editBookAs` the callables use: ledger, Extractions and
  moon notifications (only if the holder is a Station Manager, as for a visit),
  donations into the selected divisions, monotonic upserts, gap detection,
  re-matching of Unmatched donations, `allocatePayments` and
  `settleStatements`. It writes the same `lastSync` ("Synced 2h ago by Scheduled
  sync (<holder>)", `scheduled: true`) and audit entries (`via: scheduled
sync`).
- **What it may not do.** Issue a Statement or send mail. Those stay officer
  actions; the run can ask for only two edits (`assignPayment`,
  `settleStatements`), and issuing a Statement is not among the helpers it
  imports. It does not auto-group an officer's Characters (needs their device).
- **Shared logic.** `functions/` cannot import `src/`. The pure half of the
  visit's pipeline (`observedRowsFromLedger`, `detectGaps`/`mergeGaps`,
  `donationsFromJournal`, `matchDonation`/`resolveDonations`,
  `reconcileExtractions`, `placeObservedRows`, `planSettlements` and the moon
  fields of the notification payload parser) is mirrored in
  `functions/src/corpTaxBookSyncEngine.ts`, beside the existing
  `corpTaxBookEngine.ts` mirror, and `src/engine/corpTaxBook/syncMirror.test.ts`
  runs both copies on the same inputs. The engine changes first, then the mirror.
- **Failure and revocation.** If the holder no longer has an editing role, left
  the corporation, SSO answers `invalid_grant`, ESI refuses the token, or the
  book is off, the schedule **stops** for that corporation: the grant doc is
  deleted, the token revoked at SSO (unless it is already dead), the reason is
  written to `meta/scheduledSync` and the audit log, and the book's health strip
  shows it. A stopped schedule holds nothing. Re-enabling is a fresh opt-in.
  A transient failure (ESI or SSO unavailable, a 5xx) skips the run and keeps the
  schedule. Revoking, a holder's stale-account purge, and a replacement all
  delete the doc and revoke the token.
- **ESI error budget.** The budget is per client id and shared with every
  user. The run goes corporation by corporation, one request at a time (pages
  sequentially), identifies itself (`X-Compatibility-Date`, descriptive
  `X-User-Agent`, no email), and ends the whole run on a 420/429 or when
  `X-Ratelimit-Remaining`/`X-ESI-Error-Limit-Remain` run low; it skips, never
  retries. A 403 on the holder's own token is a refusal, not a budget problem.
- **Cost.** One function invocation per 6 hours, plus Firestore reads of the
  book (miners, Statements, payments, dismissals, Extractions) once or twice a
  run and the sync's writes, which the same data costs when an officer syncs.
  Cloud Scheduler adds one job (about $0.10/month past the free jobs). The
  book's collections are small next to the contract snapshots that dominate the
  bill (ADR 0019).
- **Disclosure.** What We Store, `public/privacy.html` and
  `public/delete-data.html` say that, for a corporation whose book has
  Automatic sync on, an encrypted, narrow-scope token of the officer who turned
  it on is stored on our server, and how to remove it.
- **Deploy.** `functions/`, rules and indexes deploy manually, after merge.

## Considered Options

- **Keep syncing on visit only.** Rejected by the maintainer: the book goes
  stale between visits and ESI history is lost in the gaps.
- **CEO-only opt-in.** Rejected: the CEO often is not the Accountant who reads
  the ledger, and the CEO can already revoke anyone's grant.
- **One grant per officer, all syncing.** Rejected: duplicate ESI calls for the
  same corporation data and more tokens on the server for no more freshness.
- **Let the run issue Statements and send the mail too.** Rejected: issuing
  fixes amounts and mailing contacts players; both stay deliberate officer acts.
- **A second key secret.** Rejected for now: purpose-bound additional
  authenticated data keeps the two collections' blobs apart without provisioning
  another secret; split the key if the grants ever need separate rotation.
- **Read the corporation's structures with `esi-corporations.read_structures.v1`.**
  Not needed: Extractions answer to the mining scope, and the sync does not read
  the structure list.

## Consequences

- ADR 0001 is reversed for these scopes, only for a corporation that opts in,
  and only for the one officer who gave the grant. ADR 0010's "the backend holds
  no EVE token" holds for nothing the Alerts Grant did not already reverse.
- A compromised backend can read opted-in corporations' mining ledgers, wallet
  journals and the holder's notification feed. It still cannot act as them.
- The book can be up to ~6 hours (plus ESI's cache) behind, instead of however
  long since an officer last visited. A corporation whose holder loses the role
  silently falls back to officer-driven sync, and the book says so.
- The server holds a mirror of the sync's pure logic, with a parity test; it must
  change with the engine.
- A new scheduled job, the second server-side SSO refresh path, and a grant
  collection to keep out of every client (`rules-tests/` pins it).

## Addendum (issue #4507): a second grant kind

A Collector book's feeder corporation hands over a mining-only offline grant
(`kind: 'feeder'`, scope `esi-industry.read_corporation_mining.v1`), held in the
same collection under the same rules. See
`docs/context/decisions/20261020-135239-collector-books-feeder-records-coverage-periods-and-the.md`.
