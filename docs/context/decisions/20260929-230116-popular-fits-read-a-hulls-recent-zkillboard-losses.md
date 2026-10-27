# Scope decisions — Popular fits read a hull's recent zKillboard losses (issue #2327)

_Recorded 2026-09-29 · issue #2327._

- **Popular fits come from the hull's ~40 most recent zKillboard losses, not kills or a curated fit site.** zKillboard's `losses/shipTypeID` API is the one public source of what people actually fly that a browser can read (no custom headers, as decision `20260924-195833`). A hash-only response is resolved through ESI's public killmail endpoint at `ESI_FANOUT_CONCURRENCY`; a killmail ESI can't read is skipped, not fatal. A good result is held in memory per hull for ten minutes; a failure is never cached and shows a one-line note, never blocking the rest of the page.
- **A group is the multiset of fitted module typeIds.** Charges, drones, cargo and which slot index a module sat in don't split a group; a loss with fewer than 3 fitted modules is skipped. Groups sort by loss count, ties to the most recent.
- **Opening a group Loads its most recent loss, charges kept, cargo dropped.** Charges are what that pilot had loaded; cargo is loot and spares that differ loss to loss, so it would be noise in a fresh Fitting. Value is the mean of zKillboard's `fittedValue` (else `totalValue`) across the group.
