# Scope decisions — The Tax tab counts a running account's corrections and partial payments as the book does

_Recorded 2026-11-19._

- **A running account's Tax tab and the corp book's Miner page now agree on Owed and Credit.** `personalParity.test.ts` builds the same records through both and compares them.
- **A correction owes whatever day it is dated.** One dated on a day the member did not mine sits on the nearest billed day at or after it (a credit pays the oldest days). Before, it was ignored.
- **A credit bigger than its day carries on** to the oldest other days, then stays as credit, as the book's allocator does. Before, the excess was dropped.
- **The book's money reduces the oldest unpaid day** when it does not cover it whole, so a partial payment lowers Owed instead of showing as Owed plus Credit. Only a true overpayment is left as credit.
- **Not changed:** the member's own paid marks (which decision 20261120-235011 later drops) and in-flight donations (still whole days), and the corp side's stored paid-through, which the member cannot read, so the two can still differ on a day an officer recorded paid.
