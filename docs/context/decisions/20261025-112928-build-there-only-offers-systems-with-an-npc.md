# Scope decisions — build there only offers systems with an NPC industry station

_Recorded 2026-10-25._

- **The cheaper-nearby hint and the cost-index popover list only systems with an NPC station that runs industry jobs.** A lower cost index is no saving where nothing can be built. The set comes from ESI's public `/industry/facilities` (NPC stations only), read once per session; `stations.json` carries no services, so it cannot answer this. A player structure the pilot may use cannot be listed by any ESI endpoint, so a system with only one is not offered. If the facility list cannot be read the hint shows every cheaper system, unfiltered, rather than none.
- **Reactions are not filtered.** NPC stations cannot run them and structures cannot be checked, so the highsec rule is the only one that applies.
- **"Build there" on a system with an NPC station switches the plan to the NPC station facility.** Rigs and the custom tax are cleared, so the fee uses the fixed 0.25% NPC tax `jobFee` applies (the same rule as picking a station in the location search). The plan's old structure does not exist in the new system, and keeping it would carry its tax and rigs along.
- **The ISK saving shown is the whole fee difference when the move changes facility.** It includes the NPC tax in and any structure job-cost bonus and owner tax out, and the hint is hidden when the move would not save ISK (a cheap structure beats a lower index).
