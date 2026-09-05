# Scope decisions — reactions as a Build Plan activity (issue #460)

_Recorded 2026-09-05 · issue #460._

- **A reaction formula is a `BlueprintType` with `activity: 'reaction'`, not a
  separate catalog.** `scripts/build-sde.mjs` now emits both `industryActivity`
  ID 1 (manufacturing) and ID 11 (reaction) rows into the one `blueprints.json`,
  each tagged with its activity. This is what lets the existing blueprint/
  product picker, `byProductTypeID` reverse lookup, and price-fetch widening
  (`buildPlanTypeIds`) all pick up reaction formulas with no second code path —
  the ticket's own framing ("gets the entire existing pipeline unchanged") only
  holds if the data enters through the same door.

- **Reaction formulas always run at ME0/TE0, enforced twice.** Verified against
  a live `industryActivity.csv` dump: the 119 reaction-formula typeIDs have zero
  overlap with any research activity (material/time efficiency, copying,
  invention). `computeBuildPlan` clamps `me`/`te` to 0 whenever the blueprint's
  activity is `'reaction'`, regardless of what a stored plan holds, and
  `BuildPlanDetail` hides the ME/TE fields entirely for a reaction plan rather
  than showing controls that can never do anything.

- **Reactor rigs get their own security-multiplier table, not the
  manufacturing one.** `REACTION_RIG_SECURITY_MULTIPLIER` (highsec/lowsec ×1,
  null/WH ×1.1) is a new constant beside the existing
  `RIG_SECURITY_MULTIPLIER` (×1/1.9/2.1), selected in `materials.ts`/`time.ts`
  by `ctx.facility.activity`. The acceptance criteria required the existing
  manufacturing constant to be untouched, and the two tables' values are
  sourced from different dogma attributes on different rig type lines, so
  merging them into one parameterized table would not have saved anything real.

- **No skill-bonus carve-out for reactions.** `timeModifier` keeps applying
  Industry/Advanced Industry skill terms unconditionally, including under a
  reaction facility context. The triage comment's sourcing covered facility and
  rig bonuses only; inventing a claim that those two skills don't apply to
  reactions, with no dogma/wiki citation to back it, would have been exactly
  the kind of unsourced constant this engine's citation convention exists to
  prevent. If that assumption is wrong, it is wrong in one visible line a
  future pass can correct with a citation, not buried in a silent activity
  branch. Tracked for follow-up sourcing as issue #513.

- **Facility and location pickers filter by activity, and a new plan's default
  facility no longer carries across activities.** `FACILITY_PRESETS` entries,
  `buildLocationOptions`, and `searchBuildLocations` all gained an
  `activity`/`IndustryActivity` parameter so a reaction plan is only ever
  offered Athanor/Tatara (never an NPC station — none exists for reactions) and
  a manufacturing plan is never offered a refinery. `Industry.tsx`'s
  `newBuildPlan` only carries the most-recently-updated plan's facility
  forward (issue #456) when that facility's own activity matches the new
  plan's; otherwise it falls back to the historical per-activity default
  (`npcStation` or `athanor`) rather than saving an incompatible facility.

- **Folded in now, not deferred: a reaction-produced material gets a
  make-or-buy verdict when it shows up as a sub-input inside _any_ plan, not
  only a reaction plan.** This closes the exact gap the maintainer's follow-up
  comment described (Reinforced Carbon Fiber showing no marker inside a
  manufacturing plan) — cheap once reaction formulas share the catalog, since
  `materialRecipe()` already looked the typeID up there. `MaterialRecipe`
  gained a third `'reaction'` variant and `MaterialsTable` a fourth glyph
  (`Icon.Reaction`, a flask) sharing manufacturing's "build" tone rather than
  inventing a third colour — the shape is what the docs/DESIGN.md §7 rule
  requires to differ, not the tone.

- **A reaction sub-input's quote is deliberately not the parent plan's own
  facility.** `reactionUnitCost` prices it against a fixed, unfitted Athanor at
  the parent's own security band, never the ambient `ctx.facility`/`rig`. The
  existing manufacturing-in-manufacturing sub-build quote reuses the parent's
  facility because a real engineering complex can run either job; that
  assumption breaks for a reaction reached from a _manufacturing_ plan, since
  no engineering complex can react at all. Assuming no rig understates the
  saving rather than misapplying a rig bonus the structure literally cannot
  fit — the conservative side of a guess this codebase has no way to make
  precisely.

- **Answers the maintainer's open question: advisory-only, not actionable.** A
  reaction-producible sub-input gets the marker and the tooltip's savings
  estimate, but never the "build here" toggle — `canBuildHere` still checks
  `method === 'manufacturing'` only. This matches how a planetary sub-input
  already behaves (marker, no expansion) rather than how a manufacturing one
  does (marker plus an inline sub-build), because expanding a reaction inline
  would need a whole second facility/rig/security context nested inside the
  parent plan, which is the kind of new engine surface this ticket's "no
  recursive BOM rollup" boundary was written to keep out.

- **Superseded from
  `20260904-235527-industry-one-level-sub-builds.md`.** That file's "known
  limits" bullet said `blueprints.json` has no producer for Reinforced Carbon
  Fiber or Pressurized Oxidizers. It does now — both are reaction-formula
  products, covered by the two bullets above.
