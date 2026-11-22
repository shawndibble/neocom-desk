# Scope decisions — A day recorded paid still takes its payment

_Recorded 2026-11-19._

- **A day at or before a Miner's stored paid-through is still paid from the payments, oldest first.** It stays settled whatever happens (D22), but it no longer skips the money. Skipping left the payment that paid it over as credit, so a Miner showed credit equal to every payment while the ledger still billed those days, and the ledger hid the difference in one catch-all tolerance-and-corrections row.
- **Why the old rule was wrong:** the paid-through day is stored from this same allocator's output, so the money that settled a recorded-paid day is always in the payment list.
- **Not changed:** a recorded-paid day whose money was later taken back (marked "not tax") stays settled; its shortfall is written off unless a later payment reaches it first (oldest first), which can leave a newer day owed.
