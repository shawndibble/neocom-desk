# Skill Requirements Expansion — Design

## Problem

The Skill Plan tool only supports building a plan skill-by-skill. Users
actually ask three different questions it doesn't answer today:

1. "What skills do I need to fly this fit?"
2. "What skills do I need for this ship's mastery level N?"
3. "What skill affects this specific module/attribute?"

## Prior art (research summary)

- CCP's own client: dragging a fit into an empty Skill Plan auto-extracts
  needed skills (most-requested/best-received pattern found). Ship Mastery
  tab uses a 3-state icon per skill (trained / partial+hover-time / missing)
  grouped into 5 tiers. Community repeatedly asks for "add a whole mastery
  tier in one action" — never shipped cleanly anywhere.
- pyfa: "affecting skills" context menu is the only concrete implementation
  of question 3 found anywhere, and its own maintainers call the
  see-effect → change-skill loop clunky (open since 2014).
- EVEMon: skill-plan/training-queue math, no fitting or mastery UI.
- No tool found does all three well in one place — this is a real gap, not a
  copy job.

## Decision: navigation

Add a new **Ships** sub-tab to the Skills section:
`Plans | Trained | Compare | Ships`, matching the existing `SkillsSubNav`
pattern (real routes, not a `Tabs` widget). Inside Ships, a segmented control
(`Fit Check | Mastery`) switches between the two "I have a ship/fit in mind"
planning panels.

Skill → module-effect lookup (question 3) is **not** a destination. It's an
inline chip next to any attribute value already derived from ESI dogma data,
wherever that attribute already shows (Market item detail first; Industry
blueprint materials and Assets item detail can reuse the same component
later).

Rejected alternatives:

- **All 3 as one hub tab, including the lookup.** Rejected: forces a
  duplicate ship/module picker the lookup doesn't need (the user is already
  looking at the item), and research shows lookup works best inline (pyfa's
  own unresolved friction is exactly "see effect, have to go elsewhere to
  act on it").
- **Fully contextual, no new tab at all.** Rejected: fit-check and mastery
  are genuine planning activities users return to, not "already looking at
  X, tell me more" moments — they deserve a home the way Market or Industry
  have one.

Confirmed with the user directly: **no ship-fitting/loadout builder is being
built.** Other tools (pyfa, EVEShip.fit) already do that well. Fit Check
works off pasted EFT text (already supported); Mastery works off a ship
picker only, no fit involved.

## Feature 1 — Fit Check

- Reuses the existing `parseEftFit` + `fitToSkills` engine path, already
  used by the Skill Plan clipboard import, Industry's Fit Import, and
  Market's Appraisal (`src/engine/import/fitToSkills.ts`,
  `src/features/skills/planner/clipboardImport.ts`). No new parsing engine.
- New: promote it from an import-dialog step into a first-class panel —
  paste box → "Check Fit" → missing-skill list (existing `SkillBar`
  component per skill, 3-state status icon, training time) → "Add All to
  Plan" plus a per-row "Add".
- Needs a target plan (see below).

## Feature 2 — Ship Mastery

Net-new concept; nothing like it exists in the codebase or docs today.

- Ship search → 5 tiers (I–V) as expandable rows (reuse `Disclosure`).
  Each skill row: 3-state status icon (trained / partial with training
  time / missing), matching the in-game convention. Tier header shows a
  progress chip (`n/n complete` or `n/n · time left`).
- **"Add Level to Plan"** bundles an entire tier's shortfall into the plan
  in one action — the gap the research found nobody has shipped cleanly,
  in-game or third-party.
- Copy: mastery is labelled **"Suggested," never "Required"** — CCP's own
  bundles include marginal skills (EVE Uni + forum feedback surfaced in
  research); this must not read as a hard gate to fly the ship.

**Data source spike — resolved.** Fuzzwork's SDE mirror already flattens
this: `certMasteries.csv` (`typeID, masteryLevel, certID` — ship hull, tier
0–4, one or more certs per tier) joined with `certSkills.csv` (`certID,
skillID, certLevelInt, skillLevel` — `certLevelInt` = `masteryLevel + 1`)
gives the exact ship→tier→skill/level bundle needed, no CCP raw-SDE parsing
or manual data entry required. Add `certMasteries.csv`, `certSkills.csv`
and `certCerts.csv` (`certID, name` — for display) to the `FILES` array in
`scripts/build-sde.mjs` alongside the files it already downloads; combined
size (~500KB) is in line with existing downloads. Mastery is no longer
blocked and is in scope alongside the other two features.

## Feature 3 — Module/Ship → affecting skill (inline)

Two layers, shipped together:

**3a. Required Skills** (item-level, already reuses existing engine): a
section on item detail listing the item's required skills (from
`extractRequiredSkills`), status + "Add to Skill Plan." No new data.

**3b. Attribute → modifying skill** (the literal mockup: click a specific
attribute value like "Falloff 12km," see which skill changes it and by
how much). Verified feasible, moderate scope — not a quick add, its own
sub-design:

- New data: `dgmEffects.csv` (has a `modifierInfo` JSON column: per-effect
  `{domain, func, modifiedAttributeID, modifyingAttributeID, operation,
groupID?, skillTypeID?}`) and `dgmTypeEffects.csv` (`typeID, effectID,
isDefault` join table), added to `scripts/build-sde.mjs` alongside the
  mastery CSVs.
- Resolution: for the two `RequiredSkillModifier` func types (~89% of
  skill-relevant modifier rows), `skillTypeID` is embedded directly in the
  data — no inference needed. `LocationGroupModifier` rows (~800) instead
  key on the item's `groupID`, not a skill directly.
- **Multi-hop values are real**: a skill's own trained level can be an
  input to one effect that derives a second attribute, which a _further_
  effect then applies to the target item (traced example: Gunnery's own
  level → a derived "turret speed bonus" attribute → the effect that
  actually reduces rate-of-fire on modules requiring Gunnery). A single
  flat join cannot resolve this — needs a small 2–3 level attribute-value
  resolver, not just a lookup table.
- ~7 effects are permanently hand-special-cased even in pyfa's current
  generic engine (`eos`) — expect a small, explicit special-case list here
  too, not full generic coverage from day one.
- Click/tap reveals a popover: skill name, effect at the current trained
  level, "Add to Skill Plan" (same target-plan mechanism as the other
  features). Phone: touch-and-hold, matching the existing `Tooltip`
  convention — no new interaction pattern.
- First surface: Market item detail. Reusable later on Industry blueprint
  materials and Assets item detail — not built as part of this design,
  just not precluded by it.

## Target Plan mechanism (shared by all 3 features)

No "active plan" flag added to the Plan model itself. Instead:

- A per-character synced preference (`useSyncedSetting`, the same
  mechanism already backing other per-character settings) stores "last
  plan added to."
- UI:
  - **1 plan exists** → auto-selected, no picker shown.
  - **2+ plans** → a compact "Adding to: [Plan ▾]" selector next to the Add
    action, remembers the last choice per character — the same idea as the
    existing Character-filter convention (`docs/DESIGN.md`'s `Panel` `meta`
    slot).
  - **0 plans** → the Add button becomes "Create Plan & Add."

## Nav / responsive

- Desktop: left rail → Skills → sub-nav `Plans | Trained | Compare | Ships`
  → segmented `Fit Check | Mastery` inside Ships.
- Mobile: Skills is already a default bottom-bar tab
  (`DEFAULT_MOBILE_TABS`); same sub-nav/segmented pattern underneath, no
  separate mobile IA needed.
- All new UI follows existing tokens/components (`docs/DESIGN.md`):
  `Panel`, `SkillBar` (existing, reused as-is), `Disclosure` (existing,
  reused for mastery tiers), `tabStyles` (segmented control), `Tooltip`/
  `InfoTooltip` (module-skill popover).

## Data model additions

- New `Mastery`/`MasteryTier` types (ship typeID → 5 tiers → skill/level
  pairs), pending the data-source spike above. No new engine module is
  needed for Fit Check (reuses `fitToSkills`) or the module chip (reuses
  `dogma.ts`) — only Mastery needs new data plumbing.

## Testing

- TDD per project convention for any new pure logic in `src/engine`:
  mastery tier shortfall calculation, and — the highest-risk new logic in
  this whole design — the attribute→modifying-skill resolver (3b), given
  its multi-hop chains and per-func-type semantics. Write failing tests
  against the traced real example (Gunnery → derived attribute → rate of
  fire) before writing the resolver.
- Fit Check and Required Skills (3a) reuse already-tested engine paths
  (`fitToSkills`, `dogma.ts`); new test coverage there is at the UI-wiring
  level, not the engine level.

## Out of scope

- No ship fitting/loadout builder of any kind.
- No changes to in-game skill queue behavior.

## Suggested implementation order

All 4 pieces are in scope now that the Mastery data source is confirmed
(above). Sequenced so each builds on a shared dependency:

1. Target Plan mechanism (shared dependency for everything below).
2. Fit Check panel (lowest risk — engine already exists).
3. Module→skill inline chip (contextual, reuses existing dogma parsing).
4. Ship Mastery (new `certMasteries.csv`/`certSkills.csv` build-time data,
   new `Mastery`/`MasteryTier` types, new tier UI).
