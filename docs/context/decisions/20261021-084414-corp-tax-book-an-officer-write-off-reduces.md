Superseded by decision 20261120-235011: the calendar Statement no longer exists.

# Scope decisions — Corp Tax Book: an officer write-off reduced calendar bills, after payments (issue #4637)

_Recorded 2026-10-21 · issue #4637._

- **A write-off used to reduce calendar bills, never days.** One that named a bill reduced that bill only; one that named none reduced open bills oldest first, the order payments were allocated in, and never touched days not billed yet. Every book is now a Running account, so a write-off forgives the Miner's oldest unpaid days, and one that names a Late notice is no longer pinned to it (a notice is no bill).
- **Write-offs apply after every payment, in the order they were recorded.** This still holds: a payment always stays on the days it paid, and a verify link or `meta/paid` never loses one to a later write-off. What a write-off finds nothing left to forgive is dropped, never credit.
- **A day a write-off forgives in full is settled**, and the sync records it paid like any other, so it closes for good (D22).
- **The miner's line keeps the before and after.** It shows "Corrected by the corporation" (`CorpCorrectedAmount`), as an Adjustment does. A day forgiven in full reads **Waived**; the officer's day list says Written off.
- **The leaver write-off writes off the whole balance.** Write-off docs from before this change carry no `uids`: the book applies them, but the miner can't read them.
