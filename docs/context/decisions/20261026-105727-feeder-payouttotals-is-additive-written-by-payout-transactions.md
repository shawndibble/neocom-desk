# Scope decisions — Feeder payoutTotals is additive, written by payout transactions, no reader yet (issue #5242)

_Recorded 2026-10-26 · issue #5242._

- **`payoutTotals` on the feeder record is additive and optional.** `{ count, amount }` of payouts not marked "not a payout", moved by the same transaction as each payout write. A record without it is totalled once from its payouts by the next write. Dev and prod share Firestore, so older code ignores the field.
- **Rollout order matters before any reader exists.** An older Functions build that writes a payout after this one has set the totals will not move them. Nothing reads `payoutTotals` yet; the first reader must recompute it (the view rebuild already reads every payout) or deploy Functions first.
- **No `.limit` on the payout slice.** Planning reads payouts with `date >= earliest journal day - 3`; a limit would drop rows the dedupe and match need and double-count a journal entry.
