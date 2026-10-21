# Scope decisions — Corp Tax Book: an officer write-off reduces Statements, after payments (issue #4637)

_Recorded 2026-10-21 · issue #4637._

- **A write-off reduces Statements, never days.** One with a `statementId` reduces that Statement only; one without reduces open Statements oldest first, the order payments are allocated in (`allocatePayments`). It never touches days not on a Statement yet. Owner's choice (option A); rules out writing off unbilled days or oldest days across Statements.
- **Write-offs apply after every payment, in the order they were recorded.** So a payment always stays on the Statement it paid, and a verify link or `meta/paid` never loses one to a later write-off. What a write-off finds nothing left to forgive is dropped, never credit.
- **A Statement a write-off forgives in full is settled**, and the sync marks it paid like any other, so its days close for good (D22).
- **The miner's line keeps the before and after.** Payments cover a Statement's oldest days first, the write-off the next ones; the line shows "Corrected by the corporation" (`CorpCorrectedAmount`), as an Adjustment does. A day forgiven in full reads **Waived**; the officer's day list says Written off.
- **The leaver write-off writes off the whole balance**, so it names no Statement. Write-off docs from before this change carry no `uids`: the book applies them, but the miner can't read them.
