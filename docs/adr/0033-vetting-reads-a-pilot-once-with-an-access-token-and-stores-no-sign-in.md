# 0033 — Vetting reads a pilot once with an access token and stores no sign-in

## Status

Accepted (2026-11-12). Builds on ADR 0001 and ADR 0023; contrasts with ADR 0020
and ADR 0025.

## Context

A corporation wants to check a new applicant, and a member before a promotion to
officer or Director, for signs of spying or theft: ISK, mail, contacts and
contracts with hostile entities, undeclared characters, corporation history.
That needs wide reads (wallet journal, contacts, mail headers, contracts,
skills) of someone who is not yet trusted, shown to officers of a corporation
the pilot may not be in.

ADR 0001 keeps refresh tokens on the device. ADR 0020 and ADR 0025 made narrow,
opt-in exceptions for one Character's notifications and one corporation's
ledger. A stored grant for vetting would be neither narrow nor few: one
wide-read token for every character of every applicant and member.

A report built in the pilot's browser keeps ADR 0001 intact but cannot be
trusted here, because the pilot being vetted controls that browser.

## Decision

The browser hands a callable the pilot's short-lived EVE **access token**, one
character at a time. The server verifies it, reads ESI itself, and keeps no
token.

- **Sign-in.** A `vetting` login intent runs PKCE with exactly `VETTING_SCOPES`
  (`esi-wallet.read_character_wallet.v1`, `esi-characters.read_contacts.v1`,
  `esi-mail.read_mail.v1`, `esi-contracts.read_character_contracts.v1`,
  `esi-skills.read_skills.v1`). The callback keeps the access token in memory,
  hands it to the callable and discards the refresh token: it is never stored in
  Dexie and never sent anywhere. The scope list has a server copy pinned by a
  test, like `corpSyncScopes`.
- **Verification.** `verifyEveAccessToken` checks the signature against CCP's
  JWKS, the issuer, the audience and our client id, and takes the character from
  `sub`. A declined scope is a missing source, not an error: the report says
  that check could not run.
- **What is read.** Public character info and corporation history; with scopes,
  the wallet journal (about 30 days), contacts, mail headers (sender and
  recipients only; no subject, no body), contracts and skills.
- **What is stored.** While a pilot adds characters, each character's
  normalised rows sit in `corps/{id}/vettingReviews/{review}/inputs/{character}`,
  for at most 24 hours. On Send the pure checks (`src/engine/vetting.ts`,
  mirrored in `functions/src/vettingEngine.ts`) run once, the inputs are
  deleted, and the review keeps the assessment: flags with up to 10 evidence
  rows each, the names those rows mention, and per-character facts. No token at
  any point.
- **Who can read it.** Rules deny every client. Officers (CEO, Director,
  Personnel Manager; a live role check per call) read through callables, and
  each open is logged where the pilot can see it. The pilot reads their own
  status with a secret key returned once at the start, since an applicant has no
  session; the server stores only its hash.
- **Retention.** A decided review is deleted 30 days after the decision; a
  draft after 24 hours; the pilot can delete theirs at any time.
- **A new router.** The actions are a `vetting` group behind `vettingCall`, not
  part of `corpTaxBookCall`: several are public (no session), none touch the
  book's version stamps, and a read of many pages should not share the book
  router's instance budget.

## Consequences

- No server holds a key to any vetted character. A breach exposes stored
  reports (findings and their evidence rows), not live access.
- Firebase sees one more short-lived access token per character per read. ADR
  0001's "one short-lived access token per sign-in" already allows this shape
  (`mintFirebaseToken`); vetting uses it for a wider read.
- A report is a point in time. A fresh read needs the pilot to sign in again;
  for a member whose device token already covers the scopes that is one press.
- It cannot catch a character the pilot never declared, only make one likely to
  show up in the declared characters' dealings. The report says so.
- The ESI error budget is shared per client id. Reads go one request at a time,
  stop when the budget runs low, and public starts are limited per character.
- The EVE app registrations (dev and production) must allow the five scopes.
  `functions/`, rules and indexes deploy by hand, after merge.

## Considered Options

- **Browser-built report, uploaded.** No token leaves the device, but the
  subject of the check can forge it. Rejected.
- **Stored refresh token per character (SeAT, Alliance Auth).** Continuous
  monitoring and no re-consent, at the cost of holding wide-read access to
  every member's mail, wallet and assets. Rejected for now; if a corporation
  needs ongoing monitoring it would be a separate opt-in grant with its own ADR.
- **Encrypt the report to the reviewers' keys.** The server could not read what
  it stores, but it also could not run the checks. Rejected.
