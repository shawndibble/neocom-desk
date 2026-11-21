# Scope decisions — A donation held for review is the member's to count, and moon owner mining releases it

_Recorded 2026-11-16._ Follows #6207 (donations held for review, `reviewReason: 'no-open-balance'`).

- **A held donation is matched against every row the book bills, its moon owners' included.**
  The scheduled and officer syncs used to test a held (or new) donation only against their own
  ESI ledger read, which never holds a moon owner's refineries. A Miner who mined only there
  looked like owing nothing, and their donations stayed held for good while the book billed the
  days they paid. Both syncs now also read the stored `observed` rows of the donors' Characters
  (`storedRowsWanted` / `billableStoredRows`), a moon owner's only inside its coverage. Read only
  when a donation is held or would be; the server reads per Character from the first day that
  can count. This rules out a hold that no sync can ever release.

- **Only a donation paid on or after the book's start can be released or counted.** Mining
  before the start is never billed, so a donation made then paid nothing the book bills: it stays
  the officer's to place. The start date, not the day the book was created, is the line: a book
  that bills from before its creation bills that mining, and donations for it are payment.

- **The member sees the donations a book holds for review, and may count them as tax.** They are
  neither in flight (the book has them) nor credited, so nothing on the Tax tab said where the
  ISK went. One attention item per book lists them; Resolve offers "I already paid". With an unsettled
  Late notice of the donor's Miner it is a declaration with the transfers, and the wallet check
  now finds the sender's own held donation and credits it (clearing the hold) instead of saying
  "not found"; with none it is the donor's own claim (`claimCorpTaxBookPayment` with
  `inReview`), audited. The automatic claim never takes a held donation: an officer still
  decides unless the donor says it was tax. "Never two transfers on one payment" and
  "ambiguous" stand.
