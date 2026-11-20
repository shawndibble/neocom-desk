# Scope decisions — Corp Tax Book: a dated rate may start up to 30 days back

_Recorded 2026-11-19._

- **Every dated rate (corp, Guest, Miner, moon, refinery, feeder) may start up to 30 days before today**, so an officer can fix a rate that was wrong for recent mining across many Miners at once. Supersedes "never retroactive" in the 20261018 billing decision for the start day only; the day-by-day pricing rules are unchanged.
- **Never on a day an issued Statement already bills.** An issued Statement never changes, so the server refuses a start on or before the latest day any Statement covers (`day-on-statement`), and one more than 30 days back (`rate-too-old`). Book-wide, not per Miner: a corp or refinery rate reaches every Miner. Statements are read only when a rate is actually backdated. Rules out repricing issued Statements and a correction-line mechanism.
