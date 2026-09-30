# Scope decisions — What to train ranks fleet boosts, shown in a Fleet boosts section

_Recorded 2026-09-30._

- **A new "Fleet boosts" stats section shows what a command ship gives its fleet, and What to train ranks on it.** The section lists each running burst (charge, strength, range, length, reload) and an industrial core's compression (compressor range, fuel per activation). It appears only on a fit that has one. This replaces the earlier cut in `20260930-130314-what-to-train-ranks-mining-hold-remote-repair.md`, which left bursts and compression unranked because the engine showed no such stats.
- **The figures are the engine's final module attributes, not our own arithmetic.** Ids were confirmed by a live run raising one skill at a time on an Orca and a Vulture (see `src/engine/fittings/fleetSupport.ts`). Burst strength equals `calculation.outgoing.buffs`. A shield or armor burst's buffs are negative, so strength is shown by size.
- **Modules are told by what they need, not by a type list.** A burst has a buff duration. A compressor and an industrial core need Shipboard Compression Technology and Industrial Reconfiguration. Fuel attributes alone never make a core, since siege and triage modules burn fuel too.
- **No buff-id-to-meaning table.** What a buff does depends on the charge, and the repo has no buff names. Rows are labelled by the charge's name and show only the non-zero values.
- **Reload and fuel per activation rank as better when lower.** A fleet-boost metric across several bursts reads the best-placed burst (the largest strength, range, length and reload).
