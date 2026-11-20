# Scope decisions — Corp Tax Book: Settle up records a short payment as a part payment

_Recorded 2026-11-19._

- **Settle up records the amount the member sent by the book's own landing rule (`wherePaymentGoes`), the one the dialog previews.** Days the amount covers (within the day tolerance) are recorded Paid, oldest first. What is left part-pays the next day: only that share of its ore is recorded, so the Tax tab shows the rest as still owed (5m sent on a 6m day leaves 1m). Before, a short payment marked the oldest day fully Paid, and a payment within the day tolerance but not within 0.5 ISK left the day short.
- **The mark stays until the book credits or the member unmarks it.** No 24-hour expiry: the member's record already governs their own side, and the corporation confirms it against its wallet. A held day is skipped, as the book skips it.
