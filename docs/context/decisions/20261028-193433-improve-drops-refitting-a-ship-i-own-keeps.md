# Scope decisions — improve drops Refitting a ship I own, keeps one masked total budget

_Recorded 2026-10-28._

- **Improve only plans a purchase; the "Refitting a ship I own" mode is gone.** Refit math (net of what the removed part sells for, a changed rig paid in full and flagged destroyed) served a case nobody asked Improve to cover, and a two-way toggle cost every pilot a control. Rules out an extra-spend cap and the destroyed-rig note; the old cap and mode rows are deleted from the device on the next start, and a stored refit-era shared cap is dropped rather than reused as a budget.
- **The budget field is typed as an ISK amount and masked live.** It takes `100k`-style shorthand or digits, and groups digits with the separator from the pilot's number-format setting as they type, so no "= 1,000,000 ISK" echo sits under it.
