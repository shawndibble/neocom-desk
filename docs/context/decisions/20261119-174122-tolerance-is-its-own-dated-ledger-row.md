# Scope decisions — Tolerance is its own dated ledger row

_Recorded 2026-11-19._

- **Each day a tolerance forgives is its own `tolerance` row in the Miner's account ledger, dated by the payment that closed the day** (a Statement's tolerance by the last payment that reached it). It replaces the one undated "Tolerance and Statement corrections" row, which grew with every forgiven day and could not be told apart from a bug.
- **The catch-all row stays only for a difference nothing explains**, now labelled "Unexplained difference", with a note that a large one is a fault.
- **The row is derived, not stored.** It cannot be edited or deleted yet; editing it needs a stored per-day exemption (a new, additive Firestore field), which is a separate decision.
