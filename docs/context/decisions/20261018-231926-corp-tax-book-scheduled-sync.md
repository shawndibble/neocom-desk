# Scope decisions — Corp Tax Book scheduled sync (issue #4068)

_Recorded 2026-10-19 · issue #4068 · amends D25 ("no server-side scheduled sync in v1")._

- **Any book editor can opt in; one holder per corporation.** A CEO, Director
  or Accountant gives the grant for their own Character. A new opt-in replaces
  the previous holder's, whose token is revoked. The CEO can revoke anyone's
  grant from the book's settings; a holder can revoke their own. Junior
  Accountants cannot, because they cannot sync a book.
- **Every 6 hours, and it syncs everything the officer visit syncs.** The
  observer ledger, Extractions and the moon notifications, and wallet
  `player_donation`s into the book's selected divisions. The grant asks only for
  the scopes those reads need (ADR 0025 lists them).
- **Sync and settle only; never issue, never mail.** After syncing it runs the
  rest of the visit's pipeline: monotonic upserts, gap detection,
  `matchDonation` and re-matching of Unmatched donations, `allocatePayments`
  and `settleStatements`. Issuing a Statement and sending mail stay officer
  actions. It also does not group the officer's own Characters, which needs
  the officer's device.
- **Roles are re-checked every run with the holder's own token.** If the holder
  lost the role, left the corp, the refresh token is revoked or expired, ESI
  refuses the token, or the book is off, the schedule stops for that corp, the
  stored token is deleted and revoked, and the book's health strip says why
  ("Scheduled sync stopped: <holder> no longer has the Accountant role"). It is
  audited. A transient failure (ESI down, SSO down, error budget hit) only
  skips that run.
- **Every run writes the same `lastSync`** ("Synced 2h ago by Scheduled sync
  (<holder>)") and appends to the audit log, `via: scheduled sync`.
