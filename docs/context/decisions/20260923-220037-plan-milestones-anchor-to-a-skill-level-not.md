# Scope decisions — Plan milestones anchor to a skill level, not entry-list position (issue #1406)

_Recorded 2026-09-23 · issue #1406._

- **A Plan Milestone anchors to (skillTypeID, level), never to an entry-list
  position or a schedule step index.** It is looked up by that key against
  the current schedule's `stepByKey`, which simply misses when the anchor is
  gone. This is why it does not reuse **Remap Marker** storage even though
  both are "a thing pinned to a row": a marker means "remap before this
  position" and is defined by where it sits, so removing an entry needs an
  explicit position-shifting fixup (`markersAfterEntryRemoval`); a milestone
  means "when this skill is done, wherever it ends up," so a reorder needs no
  fixup at all — the same key still resolves in the new schedule. Time-phased
  implant changes anchor the same way, for the same reason.

- **Three states, derived, never stored:** _projected_ (the anchor step is
  still scheduled — its date is `startDate + cumulativeSeconds`, which is
  "this and every prerequisite it needs" because the normalizer always puts
  prerequisites first), _reached_ (the step is gone because the character is
  already trained to that level), _orphaned_ (the step is gone and the level
  was never trained — the only way this happens is the entry itself was
  removed from the plan). Nothing computes or persists a state; `plan.entries`
  and `trainedSkills` already answer it on every render.

- **Orphaned never disappears silently.** It has no entry row left to show a
  badge on, so it surfaces in a small list under the plan header instead, each
  with its own remove action. Reached milestones keep their row (the entry
  is still in the plan; only its schedule step is gone) and show "Reached" in
  place of a date.

- **The plan header shows only the soonest not-yet-reached (i.e. `projected`)
  milestone**, not a full list — a maintainer decision made ahead of
  implementation, not a technical constraint. `nextMilestone()` is a plain
  filter over the same derived list every row already reads.

- **Milestone is a badge on the entry row it's anchored to, not a separate
  draggable row like a Remap Marker.** A second maintainer decision ahead of
  implementation: one milestone is one property of one row, and it moves with
  that row on reorder by construction (the key doesn't change), so there is
  nothing for a dedicated row to add.

- **Out of scope for this pass:** skill-injector facts for reaching a
  milestone faster, milestones on the Calendar, auto-creating one from the
  Ships tab's add-to-plan, and milestones on derived prerequisite rows (a
  prereq row is not user data — **Prereq Promotion** is what turns one into
  something a milestone could anchor to).
