# Scope decisions — Item Detail Made from section and collapsible Used in (issue #5646)

_Recorded 2026-10-30 · issue #5646._

- **Made from sits in Item Detail, not a new page.** It reads `byProductTypeID` (first blueprint wins, same as Used in), shows base per-run inputs, output and time only. Rules out skills, ME/TE, prices, invention and a Build Plan link (the item menu has it).
- **Made from and Used in both collapse with `Disclosure`.** Made from opens by default. Used in opens at 10 or fewer rows (the filter threshold), closed above. Both reset on drill-down; state is not persisted.
