# Scope decisions — What to train: Tech II module upgrades

_Recorded 2026-10-03._

Supersedes the "out of scope: suggesting T2 modules" bullet of
`20261002-234731-what-to-train-weighted-overall-weapon-reach-ranked.md`.

- **Only Tech I → Tech II, every copy together.** A fitted module whose
  meta group is Tech I (plain or meta, such as an Enduring afterburner) is
  paired with the Tech II sibling for the same rack; faction, officer,
  storyline and deadspace modules are never "upgraded", since a Tech II
  isn't reliably better than any of them. All fitted copies swap as one
  suggestion: eight 425mm Railgun I become eight IIs, not eight rows.
- **Only upgrades that need training.** A Tech II the pilot can already fly
  is a swap, and the Variations panel already offers it. A Tech II rig asks
  no skills at all (ESI agrees with the engine), so rig upgrades never show
  here.
- **Worked out with the whole unlock trained.** The swapped fit's stats are
  calculated with every skill on the unlocking schedule trained,
  prerequisites included (Large Hybrid Turret V on the way to Large Railgun
  Specialization I), since the pilot will have those too. Levels are only
  ever raised. So the gain shown is "train these and swap", not the module
  alone.
- **Requirements from the engine, not ESI.** The engine's own fitting rules,
  run on the module alone on the bare hull with no skills, list each skill
  it needs, down the prerequisite chain. That works offline, needs no
  per-module ESI round trip, and is testable against the pinned SDE.
- **Kept only if it still fits and helps.** An upgraded fit over its CPU,
  powergrid or calibration, or no better overall, is left out rather than
  shown with a warning. Rows rank by the same "Rank by" as the skills, in
  their own "Tech II upgrades" list; "Add to plan" adds the missing
  requirements, and the plan derives their prerequisites.
