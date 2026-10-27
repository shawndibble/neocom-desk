# Scope decisions — one plan row per skill level

_Recorded 2026-09-06._

- **A Skill Plan holds one entry per skill _level_, not one per skill**
  (supersedes "one entry per skill, as `reorder.ts` requires", recorded with
  round 31's draggable prereq rows). "Mass Production V" on a level-III
  character was a single row labelled "IV–V": two levels the user could
  neither separate nor train anything between. `entryId` is now
  `skillTypeID-targetLevel`, so a skill can own several rows, and the entry
  list matches both the shape ESI sends (one queue row per level) and the
  shape the scheduler already expanded to internally.
- **Promotion and adding are additive, never a level raise.** Promoting a
  prereq row, or picking a skill the plan already trains lower, appends the
  new level as its own row instead of raising an existing row's target. The
  skill's other levels keep the positions the user gave them, which is the
  point of splitting them. Adding a level an earlier row already covers still
  does nothing — that row would train nothing and render as the ghost round
  31 refuses.
- **Plans are split on open, once, and their Remap Markers move with them.**
  Markers persist as _positions into the entry array_, so growing that array
  ahead of a marker slides it onto a different entry.
  `splitEntriesByLevel` translates every marker alongside the entries it
  splits. It is idempotent, so an already-split plan writes nothing;
  per-marker attribute overrides need no fixup, since splitting changes no
  marker's ordinal and two markers can never collapse onto one position.
- **A drop is refused when it strands _any_ row, not just the dragged one.**
  With levels as rows, dropping "Mass Production V" above "Mass Production
  IV" leaves V training both levels and IV training none: the dragged row
  looks fine and its sibling is the ghost. The guard compares the ghost set
  before and after the drop, so only a ghost the drop actually created
  refuses it — a plan that already contained one keeps dragging normally.
- **Priority stays a property of the skill.** Setting a band on one row sets
  it on every row of that skill, because `effectivePriority` resolves per
  skill; per-row pills would display a value the band ignores.
- **The per-level disclosure caret retires with the ranges it explained.** A
  row that trains exactly one level has nothing to disclose, so the caret,
  its breakdown list and their strings are gone rather than left as an
  always-empty affordance.
