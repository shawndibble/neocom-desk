# Scope decisions — Charging a forgiven shortfall reopens the day it covers

_Recorded 2026-11-22._

- **"Charge this shortfall" (`setToleranceExemption`) drops the Miner's recorded paid-through when it covers the day.** Found by `e2e/miningTaxTiming.book.spec.ts`: a day paid a little short on its close price reads "Shortfall forgiven", and the first officer visit records the day as paid for good (`meta/paid`). The officer's "Charge this shortfall" was then logged and did nothing, because a recorded-paid day never reopens (D22) and the exemption is only read for a day still open; the Miner kept reading paid and the dialog's "the Miner owes it again" was false. Charging a shortfall raises what the Miner owes, which is the same kind of officer act as taking money off them (decision 20261121-093000), so it is released the same way: only when the recorded day reaches the exemption's date, and the next officer load records the paid-through again over the days still paid.
- **This narrows "an exemption never reopens a recorded-paid day" (20261121-093000) to exemptions that forgive.** An exemption that forgives more than the book would still only matters for a day still open, as before.
