# Scope decisions — Skills Trained is a group board (issue #3643)

_Recorded 2026-10-12 · issue #3643. Supersedes round 17's Trained-page bullet
(`20260901-092551-skills-pages-rework.md`) where they differ; what is not
repeated here (collapsed on load, state not persisted, row tooltip with the
description, 3-character search minimum) still holds._

- **The Trained page lists every skill in the SDE, not only the ones the
  character has.** A tile per skill group shows trained of total, so what is
  missing is as visible as what is there. A skill ESI does not list at all
  shows a **Need Book** marker; one ESI lists at level 0 does not (its book is
  injected). Telling "owns the book, not injected" apart needs assets and is
  out of scope. CSV export stays the skills ESI lists, so it still covers the
  same rows as before.
- **Groups expand in place under their tile**, not on a separate view. The
  tile spans the full row when open, so several groups can be read at once and
  Expand all / Collapse all still make sense. A drill-in view was mocked and
  rejected: it hides the other groups and needs its own back path.
- **Search covers untrained skills** and keeps the Market Browser pattern: a
  group with no match disappears, matching groups open, tiles read "N matches".
- **A queued level is shown beside the trained one** (`3 → 5`) and as the
  `SkillBar`'s outlined pips, the same outline a Skill Plan target already
  uses; the higher of the two wins. They share one cue because both mean
  "not trained yet, but coming".
- **A skill name on a Trained row is a link to its info modal while the rest of
  the row opens the inspector.** This overrides §6c's "a row with its own
  primary action does not link its name": here the info modal is the thing a
  pilot reaches for on a skill they have not trained, and the inspector is the
  planning view. The two are siblings (link, then button) so there is no
  interactive element nested in another. Recorded in DESIGN.md §6c Overrides.
- **Group icons come from the app's icon library**, matched by group theme,
  with the generic Skills icon as the fallback. CCP's image server renders
  every skill as the same book, and EVE University's wiki has no per-group
  icons, so neither can tell groups apart.
