# Scope decisions — Feeder accrual: settled-otherwise needs a dated mode history, credit rounds toward zero (issue #4510)

_Recorded 2026-10-20 · issue #4510._

- **Settled otherwise is read from a dated mode history (`{from, mode}` changes), not the feeder record's current `mode`.** Switching it off resumes accrual from the switch day itself (inclusive), never backfilled, which needs the dates. The record stores only `mode`, so the writer ticket persists the history; this ticket defines the engine input and the payout shape only.
- **Settled otherwise keeps no balance, as the glossary and #4504 say: `feederBalance` returns zero with display `none` while the mode is on, and the feeder is never on the pay list.** Days mined in the spell accrue nothing. The engine does not delete accrued history or payouts; switching off resumes accrual from the switch day and the balance shows again.
- **The display rounds the balance down to whole ISK in magnitude, credit included.** A credit is never overstated; nothing is rounded per day.
- **Payouts count the moment they are recorded; a journal match only attaches to one. "Not a payout" payouts are excluded.**
