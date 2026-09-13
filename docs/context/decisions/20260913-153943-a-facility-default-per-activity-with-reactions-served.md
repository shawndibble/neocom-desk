# Scope decisions — A facility default per activity, with reactions served by the Reaction Location key

_Recorded 2026-09-13._

- **A Build Plan's starting facility now comes from one default per activity,
  and no new synced key was needed to do it.** `newBuildPlan` took a single
  `FacilityDefaults` and applied it only where the facility's own activity
  matched the plan's, so a pilot could keep a manufacturing default or a
  reaction one, never both. It now takes an `ActivityFacilityDefaults` pair
  and reads `defaults[activity]`. The reaction half is
  `sync.industryReactionFacilityDefaults` — the Reaction Location default —
  rather than a third key, because the engine already treats the two as one
  fact: `IndustryInputs.reactionFacility` is documented as "absent for a
  reaction-activity plan, which reuses this `IndustryInputs`' own
  facility/rigFit/security for a nested reaction sub-build instead". Where a
  pilot's reactions run is one answer, so it is one setting. A third key would
  also have been a near-homonym of the second, which is how the next reader
  gets it wrong.

- **The Default facility picker is now filtered to manufacturing facilities,
  and `normalizeFacilityDefaults` resets a stored refinery.** Both follow from
  the split rather than standing on their own: once reaction plans read their
  own key, a refinery in the manufacturing slot is read by nothing at all, so
  leaving it selectable would offer a choice with no effect. Resetting it
  whole — the mirror of `normalizeReactionFacilityDefaults` — keeps the
  filtered picker from rendering a blank trigger for a value it cannot show.
  This supersedes the activity grouping added hours earlier: group headings
  existed to explain a single slot serving two activities, and there is no
  longer a single slot.

- **The accepted cost: a pilot who had stored a refinery as their Default
  facility loses that record's rig fit and tax.** Their reaction plans now
  seed from the Reaction Location default instead, which is an unfitted
  Athanor until they set it. No migration is written for this. `legacyKey`
  cannot serve — `createSyncedSetting` throws on a `sync.`-prefixed legacy key
  by design, since adopting across two live synced keys is not what that
  mechanism means. Copying the value across in an effect would race the two
  stores' hydration and the sync pull for a one-time fix, and the pilots
  affected are those who set a refinery there _and_ build reaction-activity
  plans _and_ have no recent reaction plan to carry forward, since
  `defaultsMatchActivity` is checked before any Settings default. One click in
  a control that now says what it does is the better trade.
