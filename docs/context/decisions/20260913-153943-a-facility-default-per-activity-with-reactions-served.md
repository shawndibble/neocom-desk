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

- **A pilot's existing refinery is moved, not dropped —
  `adoptRefineryDefault.ts`.** Storing a Tatara in the manufacturing slot was
  how a pilot used to say "my reaction plans start at my rigged Tatara", since
  `newBuildPlan` ignored the manufacturing half of it anyway. Resetting that
  record without moving it would have taken the rig fit and tax with it, and
  then the first touch of any field in the panel would have persisted the loss
  to every device. The adoption copies the record to the Reaction Location key
  when that key holds nothing, and only then resets the vacated one. It is
  written **unstamped**, exactly as `useSyncedSetting`'s `legacyKey` adoption
  is and for the same reason: a value this device may have set months ago must
  not outrank a real edit made on another device yesterday.

- **Both stores hydrate through one gate, `hydrateActivityFacilityDefaults`.**
  The adoption rewrites both rows, so a store that read first would hold a
  value it had already moved, with no reason to re-read until the next sync
  pull. Every call site goes through the gate — Settings, the Industry
  workspace, and `BuildPlanDetail` — rather than calling either store's own
  `hydrate`, which is what makes the ordering a property of the module instead
  of a convention three components have to remember. `Industry.tsx`'s separate
  hydrate of the manufacturing half alone is deleted; the workspace already
  covered it, and it was half a pair.

- **Not migrated: a device still on an older build.** It keeps pushing its
  refinery under the manufacturing key, and a device on this build shows the
  reset value for it. Nothing is lost — the adoption has already rescued the
  record locally, and the reset is in-memory until the pilot touches the panel
  — and it settles as soon as both devices run the same build. A cross-device
  migration would need a schema-versioned rewrite that sync itself does not
  offer.
