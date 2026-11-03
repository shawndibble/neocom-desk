# Scope decisions — Courier names a player structure from the device cache, and the modal asks once

_Recorded 2026-11-03._

- **The board names a player structure only from names this device already holds.** `loadCourierEndpoints` overlays `readCachedStructureNames` (no requests). It never resolves structures across the board: that is hundreds of ACL-refused `/universe/structures/{id}` calls against ESI's shared error budget, the probe `sde/npcStations.ts` exists to avoid.
- **The detail modal asks once, for the haul opened.** It calls `loadStructureName` for each unnamed structure end with the active character. A refusal (no docking access, offline, or a spent budget gate) reads **Unreadable station**, with the id on hover; it is not an error and never a re-auth prompt. With no active character nothing is asked and the id stays.
- **Ruled out:** an "Unreadable station" label on the board itself. Refusals are not readable without a request, so the board cannot tell "refused" from "not asked yet".
