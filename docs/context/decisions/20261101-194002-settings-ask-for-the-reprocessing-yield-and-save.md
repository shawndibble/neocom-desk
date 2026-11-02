# Scope decisions — Settings ask for the reprocessing yield, and save the facility base yield behind it

_Recorded 2026-11-02._

- **Settings › Market and the Appraisal page settings show one yield field, the Reprocessing Yield, in place of the Facility Base Yield.** It is the figure the EVE client shows and the one a pilot reads and changes. What is saved is still the Facility Base Yield (`sync.oreRefiningStructureRate`): the typed yield is divided by the active Character's skills multiplier, so the saved value stays right as skills change and every reader of it (Appraisal, Market order exits, Buy Ore, What to do with this ore, Mining Tax) is untouched.
- **The multiplier in Settings is a reference, not per ore.** With no pasted ores in view it is Reprocessing, Reprocessing Efficiency, the average of the ore specialisation skills the Character has trained (skills at 0 are left out) and any refining implant (`referenceSkillsMultiplier`). Exact for a pilot whose ore skills sit at one level; the Refine breakdown, which knows the ores, converts with each ore's own multiplier and is exact. The field's note says what the multiplier is.
- **No Character, no skills, no conversion.** With no active Character, or if the skills cannot be read, the Facility Base Yield box is shown instead, so a yield can always be set.
- **Not changed here:** the Buy Ore and What-to-do-with-this-ore dialogs still show a Facility Base Yield chip.
