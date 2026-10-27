# Scope decisions — Improve unlocks goals by hull role, remembered per role (issue #5100)

_Recorded 2026-10-25 · issue #5100._

- **A goal is available when the fit already does the job or the hull is built for it.** This reverses the Mine more decision's "disabled with 'No miners on this fit' when no miner module is fitted": a blank Retriever offers Mine more. Roles come from SDE ship groups (`improveRole.ts`): mining barges, exhumers, expedition frigates and the Venture → Mine more; logistics cruisers and frigates and the Nestor → Repair more and Transfer more; command ships, Orca, Porpoise and Rorqual → Stronger fleet support; industrials, freighters, blockade runners and DSTs → Carry more. The disabled chip with its reason stays for a hull with no such role.
- **Fills stay one per rack.** A role-unlocked goal on an empty fit searches fills of its groups; the Free slots decision's "a fill takes the first empty slot of a rack" stands.
- **The remembered goal is kept per hull role** (`fittingsImproveGoalByRole`: combat, mining, logistics, command, hauling). A role with none starts on its default: Best overall, Mine more, Repair more, Stronger fleet support, Carry more. The old global `fittingsImproveGoal` seeds a role once, only while no role has a goal and the old goal suits the role.
- **From a zero baseline a goal scores by absolute gain in its own unit** (m³/s, remote repair, cap transfer, hold m³, buff strength), not the flat ±1 of a ratio, so a Strip Miner fill outranks a lesser one on a blank Retriever.
