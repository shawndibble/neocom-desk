# Scope decisions — Mining Yield shows per-day totals, not per-hour rates

_Recorded 2026-10-06._

- **Mining Yield charts show each day's total (ISK, m³, count), and the stat
  card shows ISK per day mined — no per-hour rate anywhere.** Supersedes
  `20260909-204328-mining-yield-isk-hr-basis-is-calendar-time.md`. The ledger
  has one total per day and no time of day, so any hourly figure divides by a
  guess. The old ÷24 basis made a 2-hour session read as a tiny rate, which a
  label could not fix. A daily total is measured, not estimated; the stat card
  divides by distinct days with a mining entry, so empty days do not dilute it.
  - Rules out: any ISK/hr, m³/hr or Count/hr figure for personal mining, and
    a user-typed "hours mined" input (a guess presented as a measurement).
