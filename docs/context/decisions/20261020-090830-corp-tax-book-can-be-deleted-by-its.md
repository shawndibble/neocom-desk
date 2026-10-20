# Scope decisions — Corp Tax Book can be deleted by its opener; a new book is hidden from members for 3 days

_Recorded 2026-10-20._

- **The player who turned a Corp Tax Book on (while still a Director), or the CEO, can delete it.** Deletion is hard: the book, everything under it, the Statement verify links and the automatic-sync grant go, so a corporation whose payment flow doesn't fit the book yet can stop notifying its members and start over. Rules out a soft "pause" flag: a paused book would keep its stale lines and tokens.
- **A newly turned-on book is hidden from members for 72 hours** (`membersSeeFrom` on the book). Until then a member's Mining Tax page shows no balances, donation notes or notices for it, so officers can set rates, sync and payment matching up first. Applies to every new book, first or re-opened; books turned on before this have no field and stay visible. No early "show now" control yet.
