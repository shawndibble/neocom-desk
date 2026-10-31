# Scope decisions — Officers read feederViews summaries; Moon owners tab prices from them (issue #5717)

_Recorded 2026-10-30 · issue #5717._

- **An officer of the book may `get` each `feederViews/{feeder}` summary and read its `refineries`; `days`, `payouts` and `viewers` stay the moon owner's.** The Moon owners tab then shows each owner's mined value, balance and refinery count from one doc instead of accrual worked from every ledger row. Additive rules clause; summaries still cannot be listed.
- **A summary is used only while it matches the feeder record** (status, read clock, paid total, rate history, coverage, no unpriced day). The server does not rebuild a view when an officer sets a rate or mode, so a stale summary falls back to the entry path for that owner alone. No read is added to check.
- **The miner-rate column is exact from the rates when no Guest, per-refinery or per-moon rate exists;** otherwise it needs the entries and shows a dash when none are held.
- Not done here, blocked: the shell's refinery facts, current-member ids and the Extractions-tab test still read ledger rows; no stored source covers them without a new read or a server field (see PR #5717).
