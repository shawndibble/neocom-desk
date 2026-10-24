# Scope decisions — Ore-arrival wait caps at 50 minutes

_Recorded 2026-10-23._

- **Settle up's "Ore still arriving · wait ~N min" never asks for more than 50 minutes.** Refines `20261004-213852` "settle up waits for ore still arriving", which waited a full hour from the fetch that saw an entry grow. ESI's ledger lags between about 10 minutes and an hour, so ore that has just shown up was mined at least 10 minutes earlier: anything mined alongside it lands within the remaining 50. The wait now counts down from 50 minutes after that fetch, and the line drops to the small print once 50 minutes pass with no growth.
- **The one-hour window for an EVE day is unchanged.** An entry can still grow until an hour after its day ends, because the last ore of the day may have been mined at 23:59.
