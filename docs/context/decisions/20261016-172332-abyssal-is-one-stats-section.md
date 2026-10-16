# Scope decisions — Abyssal is one stats section (issue #3977)

_Recorded 2026-10-16 · issue #3977._

- **Abyssal is a stats section like the others, not a picker plus a nested "Plan an Abyssal run" disclosure** (supersedes the first bullet of `20261016-085801-abyssal-run-planner-v1-scope.md`). The section (id `abyssal`, closed by default) holds the weather field and the planner's fields flat; its row shows the session weather, or "Normal space". The planner still writes the same session pick, so the stats heading and the section never disagree. The weather's delta on the fit is worked out only while the section is open, as the disclosure did.

- **The shared Fitting view gets the same section, planner included.** The planner asks a question of the fit on screen, and the share view already evaluates that fit; the old scope's "Fitting editor" wording is widened to every page that shows the stats column. Compare keeps its own weather picker.
