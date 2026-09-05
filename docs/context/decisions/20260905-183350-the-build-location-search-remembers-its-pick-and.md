# Scope decisions — The build location search remembers its pick, and the route remembers the open plan

_Recorded 2026-09-05._

- **Picking a build location is remembered, reversing "fill-once".** The
  earlier decision (`20260905-004207-build-location-picker-fills-the-fields-a-structure.md`)
  had the search fill facility, build system and band and then step out of the
  way, storing nothing. On screen that reads as the box forgetting what was
  just chosen: every field the pick filled stays visible except the one the
  pilot actually named, and it is gone again after a reload. The plan now
  carries `buildLocationId` / `buildLocationName`.

- **The stored pair is a label and never an input.** Every number still comes
  from `facility`, `security` and `buildSystemId`, which the pick writes. That
  is what the original decision was protecting against — the job-fee mismatch
  class — and it is kept: a stale pair can only mislabel the box, never
  mis-price a job.

- **Anything that could make the label stale clears it.** The Facility select
  and the Build system field both drop the pair as they edit, because either
  one moves the job away from the place that was picked. Nothing else on the
  plan can.

- **The two fields are independently optional, unlike the build system pair.**
  `buildSystemId`/`buildSystemName` sync as one fact or not at all, since a fee
  charged at one system under another system's name is a lie. Here the id
  alone is still useful: ESI withholds a structure's name from a Character
  whose role cannot see it, and the picker already owns a "what and where"
  stand-in label for exactly that. The composed label stays in i18next — the
  record stores the id, never the copy.

- **A new plan does not inherit a previous plan's location.** Facility, rig,
  band, hub and build system still default from the most-recently-updated plan
  (#456). The location name does not: a new plan can take a different facility
  from `fallbackFacility` when the activity differs, and a carried name would
  then say a place the plan is no longer set to.

- **The last plan opened per Character is remembered, device-locally.** Coming
  back to `/industry` reopened whichever plan sorted first, so a pilot working
  one plan across sessions had to re-find it every time. Stored as one
  `settings` row keyed by characterId (`industryLastOpenedPlan`), not one id:
  the plan list is scoped to the active Character, so a single id would be
  overwritten by whoever was looked at last.

- **Device-local, not Editable Data.** It records what this screen was
  showing, not what the pilot built. Syncing it would let a phone left on one
  plan drag a desktop off the plan being worked on.

- **It feeds the fallback chain, not the explicit selection.** `selectedId`
  also decides which column a narrow screen shows (CONTEXT.md round 25 — a
  phone lands on the list, like Mail and Skill Plans). Reopening a plan is
  about which plan is selected, so the remembered id is read only where the
  first-plan fallback was, and a phone still lands on the list.

- **Written from the effective selection, not from each control that sets
  one.** The `?product=` and `?material=` deep links and the first-plan
  fallback are openings too, and the narrow-screen back control clears
  `selectedId` without changing which plan is open — recording at the source
  would have erased the memory on every back press.

- **A remembered plan that no longer exists needs no cleanup.** The id is
  adopted only when it is still in that Character's own plans, so a plan
  deleted here or synced away simply falls through to the first plan.
