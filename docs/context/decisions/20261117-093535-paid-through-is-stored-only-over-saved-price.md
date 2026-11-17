# Scope decisions — Paid-through is stored only over saved-price days (issue #6313)

_Recorded 2026-11-17 · issue #6313._

- **A Miner's paid-through day is stored per Miner in `meta/paid.minerPaidThrough`, and only moves forward.** A day counted as paid never reopens (D22), even when late ore arrives or a payment is later marked "not tax".
- **Only an officer's client advances it, and only over days priced at saved close-of-day prices.** The server has no prices, and a day with no price has no tax, so it reads as paid and would be forgiven for good. A live price is a guess that moves, so a day priced live waits. The client sends the day with `recordAccounts` (`settledThrough`); the server never computes it.
- **The server checks only what it can see.** The day must be before today UTC, after the stored day, and before any day an open dispute holds; a day that fails is skipped and asked for again next time. It trusts the client for the saved-price rule.
- **Additive for the shared Firebase project.** An older deployed function ignores the unknown `settledThrough` field, so a new client against an old function only fails to store the day. A functions deploy is needed for it to take effect.
