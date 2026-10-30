# Scope decisions — Improve remembers Job and Explore space per hull role, explorers start on Explore (issue #5579)

_Recorded 2026-10-29 · issue #5579._

- **Job and Explore space are remembered per hull role** (`fittingsImproveJobByRole`, `fittingsImproveSpaceByRole`: `{ [role]: value }`), hydrated with the other Improve settings and never stored on the Fitting. PvP on a Thrasher is PvP for every combat hull; the explorer role keeps its own value.
- **Explorer is a hull role.** Named by type id (Heron, Imicus, Magnate, Probe, Astero, Buzzard, Cheetah, Helios, Anathema, Stratios), since they share frigate and cruiser groups with combat hulls. It unlocks no goal and starts on Best overall; the goal-by-role store gains an `explorer` key, so an Astero no longer shares the combat goal.
- **Role defaults:** explorer starts on Explore, every other role on PvE; space always starts Dangerous.
- **The old single rows (`fittingsImproveJob`, `fittingsImproveSpace`) seed a role once**, while no role has a value, and only if the pilot had moved them off the default (a stored default says nothing, so an Astero still opens on Explore). Once any role is stored they are ignored.
