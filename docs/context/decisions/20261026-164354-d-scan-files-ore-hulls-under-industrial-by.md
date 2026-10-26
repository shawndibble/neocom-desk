# Scope decisions — D-Scan files ORE hulls under Industrial by type id

_Recorded 2026-10-26._

- **ORE builds no combat ship, so every ORE hull is Industrial (or Transport) on the Fleet board and is never a threat in the Danger read.** A Pioneer on a D-Scan was flagged dangerous because the role map files by SDE group and the Pioneer shares the Destroyer group with combat hulls. This is an exception to "role groups are pinned to SDE group ids" (`20261008-124955`): hulls that share a group with combat ships are pinned by type id (`ORE_HULL_TYPES` in `dscanRoles.ts`).

- **No faction field was added to `types.json`.** That needs a network SDE re-bake and a large data diff. `shipTree.json` carries `factionID` but is 600 KB and lacks the Odysseus. Instead a test reads the Ship Tree and fails when any ORE hull (faction 500014) is not Industrial or Transport, so a new ORE hull in a combat group is caught in CI.

- **Group 4902 (Expedition Command Ship, the Odysseus) is Industrial. Group 1022 (Zephyr) and 5087 (yachts, campaign buses) are left out of the fleet** like capsules and shuttles: non-combat, never a threat.

- **Not decided:** group 5120 (Salvation, Simurgh, Gaia, Ymir) still reads as damage until someone identifies the hulls. The own-ship rank still goes by group; a Pioneer pilot's kill threshold is 1 either way.
