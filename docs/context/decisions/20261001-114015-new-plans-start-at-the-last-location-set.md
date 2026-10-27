# Scope decisions — New plans start at the last location set on a plan page

_Recorded 2026-10-01._

- **The Settings-level default manufacturing facility and default reaction
  location are gone.** Both synced records
  (`sync.industryFacilityDefaults`, `sync.industryReactionFacilityDefaults`)
  stay, but nothing in Settings writes them any more. A Build Plan page
  writes them instead. This supersedes the Settings-default bullet of
  `20260910-082559-reaction-location-a-second-facility-context-lets-craft.md`,
  along with issue #456's "copy the most recently updated plan" rule for
  location.
- **Why.** A pilot picked their Azbel in Badivefi through Build Location on
  one plan, and their next plan opened at the hub's system with no build
  location. Two separate defaults were fighting, and neither was the place
  they had just chosen. The copy-forward rule followed whichever plan was
  _updated_ last, so a runs edit on an old plan pulled every new plan back
  there. It also never carried the picked place unless the activity matched.
  The Settings default only applied to a first plan, so it hardly ever
  applied.
- **Write rule.** When a plan-page edit changes the plan's primary location,
  the plan's whole resulting location becomes the default for that plan's
  activity. The primary location is facility, rigs, tax, security band,
  build system and picked place. A manufacturing plan writes the
  manufacturing record. A reaction-activity plan writes the reaction record,
  because its own location is where its reactions run. When an edit changes
  a manufacturing plan's Reaction Location, that location becomes the
  reaction record.
- **What does not write.** Edits that touch no location field don't write:
  runs, hub, sourcing, price basis. Turning on Include Reactions doesn't
  write either, because its pre-fill _is_ the remembered value. Derived
  security corrections don't write. Writes from anywhere other than a plan
  page don't write: Opportunities seeding, Fit Import, a group Retarget from
  the group view, sync pulls. Those are the app moving plans, not the pilot
  choosing a place. The plan page's own "apply group target" link does write,
  because it is a plan-page action.
- **Read rule.** `newBuildPlan` takes the whole location from the remembered
  record for the new plan's activity, guarded by the existing "preset hosts
  this activity" check. If the record names an incompatible facility, the
  whole record is refused: the plan gets the fallback facility at the hub, in
  highsec, with no place. A record with no band means highsec. Hub and
  material price basis still carry from the most recently updated plan. They
  answer where the pilot _trades_, which is a separate question.
- **Upgrade path: the old rule holds until a plan page writes.** A record
  written from a plan page carries `setOnPlanPage: true`. A record without
  that marker is a Settings-era record or the untouched default. While a
  record is unmarked, a new plan still takes the most recently updated
  plan's whole location, as long as that plan's facility hosts the activity.
  Otherwise it takes the record. Without this, a pilot who has built at one
  Azbel for months would get an NPC station on their first new plan after
  the update.
- **Writes wait for the refinery adoption and skip no-ops.** A plan-page
  write first awaits `hydrateActivityFacilityDefaults()`. If it landed
  mid-adoption, the adoption's reset would overwrite it. A record equal to
  the one already held isn't written. Plan creators (new plan, Fit Import,
  Opportunities' Add to Compare, Log production) read the records off disk
  after hydration, not from a render value that may still be the default.
- **Each plan keeps its own location.** The remembered record only decides
  where the next plan starts. Editing it never moves an existing plan.
- **Opportunities prices where its seeded plan will build.** A row's job fee
  reads the remembered manufacturing build system's cost index, so "Add to
  Compare" doesn't quote a different fee once the plan opens. The cost:
  Opportunities' cache key includes the manufacturing record, so a real
  manufacturing location change on a plan page re-prices the tab. Above the
  auto-recalculate threshold, that shows the Refresh prompt. The reaction
  record isn't part of the key, because no row reads it.
