# Scope decisions — Removing a moon owner: the 24 hours start at the first sent notice, payee guard is code-only (issue #4520)

_Recorded 2026-10-20 · issue #4520._

- **The 24 hours start at the first removal notice sent.** The queue's send time (or the officer's "I sent the notice") is posted to the server; a removal with no notice never takes effect. Why: a removal must never take effect silently.
- **Recipients are the book's officers with a live access record, plus the moon owner's CEO and payee** (via `moonOwnerMailRecipients`). An officer who has not opened the book in 24 hours is not mailed.
- **Nothing sets a payee yet.** `setFeederPayee` (callable, no UI) is the one writer and always stamps `payeeChangedAt`; the payee-link guard lives in `payeeMayForce` and is never in a UI string, mail, audit entry or error.
- **Leave during a pending removal reads as removed.** Same ending as the payee link and the clock running out.
