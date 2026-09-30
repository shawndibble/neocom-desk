# Scope decisions — Fittings: drones in space take bandwidth, not drone bay room

_Recorded 2026-09-30._

- **A drone in space takes no drone bay room; only drones in the bay count against it.** This supersedes "Drones in space count against the bay, because they launched from it" in `20260924-215855`. A pilot can have a flight out and a full bay beside it (5 heavies in space, the bay restocked with lights), so launching a drone frees its m³, and the bay bar shows only what sits in the bay.
- **The in-space count is capped by bandwidth and the pilot's max active drones, not the bay.** Raising the "In space" box in the List stops where Launch would. Before the stats are known, nothing caps it. A drone type the engine gave no bandwidth for doesn't launch. As before, a count can always come down.
- **A drone dragged from the Add panel onto the Drones rack goes straight into space.** It never passes through the bay, so a full bay doesn't stop it. When it can't launch, it goes in the bay if it fits there.
- **Recall brings back only what the bay has room for.** The rest stay in space. "Move to bay" is disabled when none would fit.
