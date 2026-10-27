# Scope decisions — Ore decision dialog taxes both exits and defers plan counting (issue #2836)

_Recorded 2026-10-07 · issue #2836._

- **Sell raw and Refine then sell both deduct sales tax.** The Mining day detail deducts none; the ticket asked for "buy price less sales tax", and taxing only one exit would skew the comparison, so the Assets dialog taxes both with the Character's Accounting level and says so in its pricing note. The Mining view is unchanged.
- **This slice ships design A (the Assets dialog) only.** The plan-side parts (design B: the Ore toggle, Ore Source, "Your ore could cover" lines, recomputed Costs & revenue, Assets chips) are not built yet; the dialog's "Use in plan" card reads a plan's remaining mineral need but does not change the plan.
- **'My structure' rate is a synced number** (`sync.oreRefiningStructureRate`, 0 = NPC station at 50%), because ESI cannot read a structure's refining rate and the typed value is player data.
