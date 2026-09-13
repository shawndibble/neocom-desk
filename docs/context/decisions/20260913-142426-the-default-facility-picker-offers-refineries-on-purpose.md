# Scope decisions — The Default facility picker offers refineries on purpose, grouped by activity

_Recorded 2026-09-13._

- **Filtering the Default facility picker to manufacturing facilities was
  proposed, verified, and rejected: it removes a capability and fixes no bug.**
  The claim it rested on — that a refinery stored there silently becomes the
  build facility — is false. Every plan-creation path routes through
  `newBuildPlan`, which takes the stored record only when
  `FACILITY_PRESETS[facility].activity` matches the new plan's own activity and
  otherwise falls back through `fallbackFacility` (`npcStation` for
  manufacturing, `athanor` for reactions). Measured: a stored
  `{tatara, [meT2,teT1,none], 2%}` yields a reaction plan at Tatara with the
  rig fit and tax intact, and a manufacturing plan at an unrigged NPC station.
  The record is never misapplied. So the unfiltered list is load-bearing — it
  is the only way a pilot says "my reaction plans start at my rigged Tatara",
  and `sync.industryFacilityDefaults` is the only key that can carry it. The
  Reaction Location default is a different thing: the _secondary_ location a
  manufacturing plan uses once Include Reactions is on, not a
  reaction-activity plan's own primary facility. Confirmed against the game
  rule too — refineries and engineering complexes are mutually exclusive for
  reactions vs manufacturing, so an activity-matched default is the only
  coherent shape.

- **What was actually wrong was the control saying none of that, so the
  options are grouped by activity and the hint states the rule.** One slot
  labelled "Default facility" with "Where a new build plan starts" gave a
  pilot who picked a Tatara no sign that they had just set the reaction
  default and left manufacturing plans starting from an NPC station. The
  `Manufacturing` / `Reactions` group headings put the consequence at the
  moment of the pick. `newBuildPlan.test.ts` pins both halves of the rule so
  the next reader finds the measurement rather than the inference.

- **Not done: splitting this into two stored defaults, one per activity.**
  That is the shape the pilot probably wants — a refinery _and_ an engineering
  complex, both remembered — but it is a second synced key and the full
  three-file allow-list tax, and it is a feature rather than a correction.
  Left for its own ticket rather than smuggled into a labelling fix.
