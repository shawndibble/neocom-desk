# Brief A — Skill Plan editor & remap optimizer UX

Items 01, 05, 08, 10.
Read-only investigation. Optimizer performance numbers below are drawn from
this plan's `README.md` §5.6 ("D5 — the O(R²) segment grid, and why it is
gone"), measured against the real `src/engine/optimizer` code and now the
source of truth; earlier ad hoc scratchpad measurements in this brief have
been superseded and removed.

---

## Three task premises that are FALSE — read before anything else

1. **"Item 08 … means a Dexie version bump."** FALSE.
   `src/db/index.ts:38-43` says it in so many words for `markers`: _"Optional
   and additive — not indexed, so no Dexie schema version bump is needed."_
   `db.version(3)` (`src/db/index.ts:107-114`) is still latest and
   `skillPlans: 'id, characterId'` never listed `markers`. Commit `954eb16`
   touched `src/db/index.ts` by **+6 lines of type + comment only** — no
   `db.version(4)`. A `priority` field is never a query key either, so it needs
   no bump.

2. **"Drag-reorder today is mouse-only."** FALSE.
   `src/features/skills/planner/EntryList.tsx:142-145` already registers a
   `KeyboardSensor` with `sortableKeyboardCoordinates`. Reorder is keyboard
   operable today (Space to lift, arrows, Space to drop). The a11y win in item
   10 is real but smaller than claimed — it's _discoverability_ (Cmd+↑/↓ vs a
   drag mode nobody knows about), not "no keyboard path exists".

3. **"Item 08 … push/pull field mapping in `src/sync/`, copy `d90e417`."**
   FALSE as stated. `priority` belongs on `PlanEntry`, which is _nested inside_
   `SkillPlanRecord.entries`, and `planSync.ts:350` / `:362` pass
   `entries: p.entries` / `entries: r.entries` wholesale in both directions. A
   nested field syncs with **zero** `planSync.ts` change. What _does_ transfer
   from `d90e417` is the Firestore-rejects-`undefined` hazard, which now
   applies **inside array elements**. See item 08 for the exact rule.

Two further doc-vs-code staleness findings from the original teardown are now
fixed on `main`, not still open: `docs/ARCHITECTURE.md`'s route table used to
call Remap Markers "in flight" — it now marks `/skills/plans` "shipped"
(`src/features/skills/planner/markers.ts`, shipped in `954eb16`). And
`placeRemaps.ts`'s docstring used to claim a single blanket "~200-step plans
fast" figure — it has been rewritten (see §5.6 below) to state the real,
per-`remapCount` cost instead.

---

## Measured optimizer cost (drives items 01 and 05) — already fixed, not open work

The O(R²) segment-evaluation cost this section used to document is gone.
Fixed already, per README §5.6 ("D5 — the O(R²) segment grid, and why it is
gone", shipped 2026-08-30):

- `placeRemaps` used to evaluate an R×R grid of segments — R being the number
  of maximal attribute-pair runs, not step count — each cell brute-forcing
  `bestAttributes`'s 2,885 attribute allocations before running the DP. That
  is the mechanism the original version of this section measured at 624 ms
  at 46 pair runs and 3.1 s at 91. The grid no longer exists: segment cost is
  linear in SP, so `bestAttributes.ts`'s `allocationCostTable` prices every
  allocation once and the DP picks boundaries against that table, instead of
  brute-forcing an allocation per boundary pair.
- **`remapCount === 1`** takes its own O(R) suffix scan (unaffected by the
  identity above, and unchanged since it shipped): **~59-81 ms at 200 steps**,
  Booster-blind vs. boosted. This is the common case — `SkillPlans.tsx`
  prefills new plans from `remapInfo.available`.
- **`remapCount >= 2`** now costs **~6-13 ms Booster-blind, ~419-902 ms
  boosted** at 200 steps (`remapCount` 2 through 5) — down from ~2-2.7 s. The
  boosted cost "cannot be restructured away" (README §5.6): a mid-segment
  Booster expiry defeats aggregation, so those segments still have to be
  priced one at a time.
- **`MAX_SUPPORTED_REMAPS` is 2** (`placeRemaps.ts`, raised from 1 on
  2026-08-30), and `PlanEditor` clamps any stored `plan.remapCount` to it
  (`Math.min(plan.remapCount, MAX_SUPPORTED_REMAPS)`) before calling the
  optimizer. So the worst case items 01 and 05 ever render is
  `remapCount = 2`: ~6 ms blind, ~419 ms boosted — cheap enough for a live
  badge behind a debounce, no bounding approximation and no Web Worker
  required (see item 05).
- The signature memoization this section used to describe (keyed on the
  SP-per-pair signature of every `[i,j)` interval) is gone along with the
  O(R²) grid it memoized. The only cache left in `placeRemaps.ts` is
  `boostedCost`, a `Map` keyed on segment-plus-start — needed because a
  Booster's remaining life depends on when a segment starts, not on the
  segment's SP alone.

None of the above is open work for items 01/05 to schedule — it already
shipped. What it changes is what those items need to build: no bounding math,
no Web Worker, just an exact number cheap enough to compute live (see the
corrected item 05 below).

---

## Item 01 — Explain the remap schedule

**Artifact claim:** "We have the engine, not the story. `engine/optimizer/placeRemaps` and `bestAttributes` already compute this, and `PlaceRemapsResult` already returns per-segment attributes and duration, `savingsSeconds`, and a no-remap segment when a remap gains nothing — every value the timeline needs. Pure UI work, no engine change."

**Verdict:** PARTIALLY TRUE — the per-field claims are all correct, but "every value the timeline needs" is not: the projected finish date and the step-index→plan-row mapping for inline dividers do not exist anywhere on `RemapSegment` or `PlaceRemapsResult` (`src/engine/optimizer/placeRemaps.ts`). Neither forces an _engine_ change; both need new non-engine code.

**Verified baseline (field by field):**

| Timeline value                                                  | Present?  | Citation                                                                                                                                                                                  |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| per-segment attributes                                          | YES       | `RemapSegment.attributes: Attributes` (`placeRemaps.ts`)                                                                                                                                  |
| per-segment duration                                            | YES       | `RemapSegment.seconds` (`placeRemaps.ts`)                                                                                                                                                 |
| per-segment start/end step                                      | YES       | `RemapSegment.startIndex`/`endIndex`, inclusive (`placeRemaps.ts`)                                                                                                                        |
| "this segment is a remap" flag                                  | YES       | `RemapSegment.remap: boolean` (`placeRemaps.ts`; leading current-attrs segment is `false`)                                                                                                |
| `savingsSeconds`                                                | YES       | `PlaceRemapsResult.savingsSeconds` (`placeRemaps.ts`)                                                                                                                                     |
| no-remap-is-better case                                         | YES       | `noRemapResult()` (`placeRemaps.ts`), taken when `remapCount <= 0` and when current attrs already beat the best reachable allocation                                                      |
| baseline for "% faster"                                         | YES       | `PlaceRemapsResult.currentSeconds` (`placeRemaps.ts`) — `savings/currentSeconds` is the percentage, no new field needed                                                                   |
| **projected finish date**                                       | **NO**    | nothing in `src/engine` touches `Date`; `ScheduledStep` (`engine/types.ts:57-61`) carries only `seconds`/`cumulativeSeconds`                                                              |
| **"REMAP BEFORE \<skill\>" divider position in the entry list** | **NO**    | `segment.startIndex` indexes the _computed queue_; `markers.ts:132` `markerStepIndices` maps entry→step, never step→entry                                                                 |
| per-segment "why here" evidence                                 | DERIVABLE | `aggregateSpByPair` is exported (`optimizer/index.ts:3`); counterfactual seconds computable from `engine/sp.ts` `spBetween`/`trainingRate`/`timeToTrain` (all exported, `sp.ts:31/39/47`) |

Both optimize modes return the same `PlaceRemapsResult` — `optimizeAtMarkers.ts:14`
imports the type rather than defining its own, so a single timeline component
serves both.

**How it is surfaced today:** `PlanEditor.tsx` holds two independent
`useState<PlaceRemapsResult | null>` slots — `optimizeResult` (`:119`) and
`markersResult` (`:120`) — filled by button handlers `handleOptimizeRemaps`
(`:238-247`) and `handleOptimizeAtMarkers` (`:249-258`). Both render through one
shared private helper `renderSegments` (`:263-292`) into two separate `Panel`s
(`:503-535`) _below_ the toolbar. A flat `<ul>`: "Segment N", one i18n sentence,
and `formatDuration(segment.seconds)`. Results are deliberately **cleared** on
any plan/entries/markers change (`:190-200`) because segment indices go stale.

**Gap:** the whole narrative layer. No card-per-remap layout, no attribute
chips, no delta-vs-current, no inline dividers in the entry list, no headline
(time saved / % faster / finish date), no inspector. Plus the two missing values
above.

**Engine vs UI split:**

- `src/engine` — **nothing new required**. Do NOT add a finish-date field to the
  optimizer: it would put a wall clock inside a pure module (CLAUDE.md +
  `docs/ARCHITECTURE.md` §2 "no fetch/DOM/Dexie"). Optionally extract the
  segment-explanation math (`segmentEvidence(steps, skills, segment, currentAttributes, implants)` →
  `{ spByPair, secondsOnCurrentAttributes, secondsOnNeighborAttributes }`) into
  `src/engine/optimizer/explainSegments.ts` — pure, TDD-required — because it is
  arithmetic over `spBetween`/`trainingRate`/`timeToTrain` and belongs beside
  the optimizer, not in a component.
- `src/features/skills/planner` — the timeline component, chips, dividers, the
  step→row mapping, and the wall-clock read for the finish date. Follow the
  existing purity-escape-hatch pattern at `PlanEditor.tsx:151-156` (`Date.now()`
  read with an `eslint-disable-next-line react-hooks/purity` and a comment) —
  `react-hooks/purity` is enforced in this repo.
- `src/routes/SkillPlans.tsx` — unchanged.

**Files touched:**

- `src/features/skills/planner/PlanEditor.tsx` — delete `renderSegments`
  (`:263-292`) and the two result `Panel`s (`:503-535`); render `<RemapTimeline>`
  instead; pass a step→row map to `EntryList`.
- `src/features/skills/planner/EntryList.tsx` — accept an optional
  `remapDividers: ReadonlyMap<number /*entry index*/, RemapSegment>` and render
  a "REMAP BEFORE …" row. Must not collide with the existing user
  `MarkerRow` (`:87-120`) — dividers are derived/non-draggable, markers are
  user-owned and draggable; they need visually distinct treatment.
- `src/features/skills/planner/markers.ts` — add the inverse mapping (below).
- `src/i18n/locales/en.json` — new `plans.*` keys.

**New modules:**

- `src/features/skills/planner/RemapTimeline.tsx` — renders any
  `PlaceRemapsResult` as headline + one card per segment + attribute chips.
  Single reader of optimizer output for both optimize modes and item 05's detail
  view.
- `src/features/skills/planner/RemapInspector.tsx` — per-segment "why here"
  panel (SP-by-pair contribution + counterfactual seconds).
- `src/engine/optimizer/explainSegments.ts` (+ `.test.ts`) — TDD-required, pure.
- `src/features/skills/planner/stepToEntryIndex.ts` (+ `.test.ts`) — pure inverse
  of `markerStepIndices`.

**Shared primitives needed** (orchestrator to assign ownership):

- **`stepIndex → entryIndex` mapping.** Currently only entry→step exists
  (`markers.ts:132-142`). Cheapest correct construction reuses the same
  invariant documented at `markers.ts:122-131`: the expansion of an entry prefix
  is a step prefix, so `normalizePlan(entries.slice(0, p))` lengths for
  `p = 0..entries.length` give the boundaries; a running scan of
  `normalizePlan` output would be cheaper still. **This is the same primitive
  item 08 needs** to attribute a prereq-inserted step to its owning entry — one
  owner, one module.
- **A shared date/datetime formatter.** None exists: `src/lib/duration.ts` only
  does durations, and every consumer inlines `toLocaleString()`
  (`routes/Wallet.tsx:190`, `routes/Overview.tsx:162`,
  `components/ui/DataAgeBadge.tsx:43`, `features/industry/ActiveJobsPanel.tsx:151`).
  Ask: `formatDateTime`/`formatDate` in `src/lib/datetime.ts`.
- **`AttributeChip`** — small labelled `PER 27` chip with a `+N`/`−N` delta vs
  current. `StatChip` (`components/ui/StatChip.tsx`) is close but is
  label+value only, no delta and no compact row density. Either extend
  `StatChip` or add a planner-local chip; needs a design owner.
- **`MIN_MEANINGFUL_SAVINGS_SECONDS`** (`PlanEditor.tsx:47`) must be promoted
  out of `PlanEditor` — items 01 and 05 both need the same "does this count as a
  gain" threshold.

**Design tokens / components used:** `Panel` (one per optimize mode, no nesting
— `DESIGN.md` §4), segment cards as `bg-panel-2` blocks separated by
`border-line` hairlines, uppercase `text-[11px] tracking-widest text-text-dim`
micro-headings for "SEGMENT N" / "REMAP BEFORE", `text-success` for savings,
`accent` only for the divider rule (matching the existing `MarkerRow` accent
treatment at `EntryList.tsx:95-109`), `tabular-nums` for every duration,
`rounded-xs` throughout. Headline number at `text-xl`, not `text-3xl` — the
`text-3xl` hero slot belongs to item 05's total time, and there must be exactly
one hero per view. **No `DataAgeBadge`**: this panel is derived from a Skill
Plan (Editable Data), not API-Derived Data. Buttons stay `ghost` — the view's
one `primary` button is already `reorderAccept` (`PlanEditor.tsx:550`).

**Tests:**

- `src/engine/optimizer/explainSegments.test.ts` — **TDD-required**. Asserts
  SP-by-pair sums match `aggregateSpByPair` over the same slice; counterfactual
  seconds equal `currentSeconds` restricted to the segment; empty segment → zeros.
- `src/features/skills/planner/stepToEntryIndex.test.ts` — **TDD-required in
  spirit** (pure logic): entry with no prereqs maps 1:1; prereq-inserted steps
  attribute to the entry that pulled them in; entries dropped from the catalog
  are skipped exactly as `markerStepIndices` skips them.
- `src/features/skills/planner/RemapTimeline.test.tsx` — no-remap result renders
  the "no gain" copy and no cards; a two-segment result renders two cards with
  the right attribute chips; percentage = `savings/currentSeconds`.
- e2e: extend the existing `optimize remaps shows attribute segments and
savings` test in `e2e/plans.spec.ts:50-62` (currently asserts `Segment 1` and
  the `remap to PER 27 / …` regex) to assert the headline and one divider row.
  No `mockEsi.ts` additions — the flow already runs on the mocked character.

**i18n keys:** `plans.timelineHeadline` ("{{duration}} faster · {{percent}}%
· finishes {{date}}"), `plans.timelineNoGain`, `plans.timelineFinishDate`,
`plans.segmentCard` , `plans.segmentDuration`, `plans.remapBefore` ("Remap
before {{skill}}"), `plans.keepCurrentAttributes`, `plans.inspectorTitle`,
`plans.inspectorWhy`, `plans.inspectorSpShare` ("{{percent}}% of this segment's
SP trains on {{primary}}/{{secondary}}"), `plans.inspectorCounterfactual`,
`plans.attributeDelta` (`{{sign}}{{delta}}`). Existing `plans.segment`,
`plans.segmentRemap`, `plans.segmentCurrent`, `plans.remapSaves`,
`plans.remapNoGain`, `plans.markersNoGain` are reusable or retirable.

**Sync / Dexie impact:** none. Read-only view over a computed result. No new
field on an Editable Data record, no `sync.`-prefixed setting.

**New ESI scopes:** none.

**Cost:** confirm **S** — _provided_ the segment inspector stays at "SP share +
counterfactual seconds". If the orchestrator wants a genuine
"here-is-why-not-one-step-earlier" proof, that needs neighbour-boundary
re-evaluation and drifts to **M**.

**Depends on:** nothing hard. Should land **before or with item 05** so the
timeline component exists for the header's detail view to link into. Shares the
step→entry mapping with **item 08**.

**Risks / open questions:**

- **Booster/optimizer disagreement — ALREADY FIXED, not a risk anymore.**
  `bestAttributes.ts`'s docstring used to say boosters were ignored by design;
  it now states Boosters are accounted for whenever a `BoosterContext` is
  supplied, matching `computeSchedule` (`PlanEditor.tsx` passes a `booster`
  context whenever the character has one enabled). D5 shipped 2026-08-30
  (README §5.6): the optimizer and the computed queue now agree, so items 01
  and 05 can put both numbers side by side without an "excludes booster"
  caveat.
- Segment results are cleared on every plan edit (`PlanEditor.tsx:190-200`). A
  timeline that vanishes on each keystroke reads as a bug. Either keep the clear
  and add an "out of date — re-run" affordance, or adopt item 05's cheap live
  estimate for the headline while the detailed timeline stays on-demand.
- Inline dividers in the entry list can only be placed when a segment boundary
  falls on an entry boundary. Prereq-inserted steps can split _inside_ an entry
  expansion; decide whether to snap the divider to the owning entry or suppress
  the inline divider for that segment.

---

## Item 05 — Plan header: total time and a live optimization badge

**Artifact claim:** "Values exist in the computed queue. Surfacing only."

**Verdict:** MOSTLY TRUE now. Total time was already one line away, and the
live badge — the harder half — got cheap for free: the O(R) `remapCount === 1`
path and the `MAX_SUPPORTED_REMAPS = 2` cap (both shipped 2026-08-30, README
§5.6) mean the worst case the badge ever computes is `remapCount = 2` at
~6 ms Booster-blind / ~419 ms boosted for a 200-step plan, not the O(R^2)
multi-second pass this brief originally measured. What is left is UI wiring
plus a trailing debounce for the boosted case, not new engine approximation
machinery.

**Verified baseline:**

- Total training time already exists as
  `const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0`
  (`PlanEditor.tsx`) and is already rendered — as an 11px dim string in the
  computed-queue Panel's `actions` slot. "Large type" is a move + a type-scale
  change, nothing more.
- `scheduled` is properly memoized on
  `[plan.entries, catalog, trainedSkills, attributes, effectiveImplants, activeBoosters]`.
  `computeSchedule` is O(steps) and cheap.
- Optimizer results are **not** live today: they only exist after a button
  press and are explicitly wiped on any entries/markers change. Item 05
  inverts that invalidation design for the badge only (the detailed segment
  list can stay on-demand — see item 01's risks).
- `PlanEditor` already clamps `plan.remapCount` to `MAX_SUPPORTED_REMAPS`
  (`Math.min(plan.remapCount, MAX_SUPPORTED_REMAPS)`) before calling the
  optimizer; the badge should reuse that same clamped value, not the raw
  stored one.
- No `Worker`, `requestIdleCallback`, or debounce utility exists anywhere in
  `src/` — checked, still true.

**Gap:** the badge component, the type-scale/placement change for the total,
and a trailing debounce so a fast reorder streak doesn't run `placeRemaps` on
every keystroke.

**Recompute / perf — the actual finding, corrected:**

The O(R²) pass this brief used to warn about is gone (see "Measured optimizer
cost" above). At the current cap of `MAX_SUPPORTED_REMAPS = 2`:

- **`remapCount === 1`** (the common case, and the default from
  `SkillPlans.tsx`'s `remapInfo.available` prefill): the O(R) suffix scan
  costs ~59-81 ms at 200 steps. Cheap enough for a live badge with a light
  debounce.
- **`remapCount === 2`**: ~6 ms Booster-blind, but **~419 ms with a Booster
  active** (`PlanEditor` passes a `booster` context whenever one is enabled).
  419 ms is too slow to run on every keystroke but fine behind a trailing
  debounce (~150-200 ms) — the number the user sees is exact either way, not
  a bound.
- No approximation, bound, or Web Worker is needed at this cap. If
  `MAX_SUPPORTED_REMAPS` is ever raised past 2, revisit — the boosted cost at
  higher `remapCount` was measured at ~900 ms (README §5.6) and does not
  improve with restructuring (a mid-segment Booster expiry defeats
  aggregation).

Badge states, both exact — no third "unproven" state needed:

- savings < `MIN_MEANINGFUL_SAVINGS_SECONDS` → **"optimized"**
- savings ≥ threshold → **"saves {{duration}}"**

**Engine vs UI split:**

- `src/engine` — **nothing new required.** `placeRemaps` (clamped to
  `MAX_SUPPORTED_REMAPS`) is cheap enough to call directly from the badge; no
  bounding module, no fast-path extraction, no Web Worker.
- `src/features/skills/planner` — header component, badge, threshold
  constant, the debounce.
- `src/routes/SkillPlans.tsx` — unchanged.

**Files touched:**

- `src/features/skills/planner/PlanEditor.tsx` — move `totalSeconds` into a
  new header component; drop the duration from the computed-queue `actions`
  slot; export/relocate `MIN_MEANINGFUL_SAVINGS_SECONDS`; call `placeRemaps`
  (clamped) behind a trailing debounce for the badge instead of only on
  button press.

**New modules:**

- `src/features/skills/planner/PlanHeader.tsx` — plan name, hero total time,
  optimization badge, count of entries.
- `src/features/skills/planner/optimizerThresholds.ts` — the shared
  "meaningful savings" constant (or fold into the engine module).
- A small debounce hook (e.g. `src/lib/useDebouncedValue.ts`) — no debounce
  utility exists anywhere in `src/` today; this is genuinely new, small,
  shared plumbing.

**Shared primitives needed:**

- `MIN_MEANINGFUL_SAVINGS_SECONDS` promoted out of `PlanEditor.tsx` — items
  01 and 05 both branch on it.
- A **badge/pill** primitive. `StatChip` (`components/ui/StatChip.tsx`) is
  label+value; the badge is a single toned word/phrase. `DataAgeBadge` is the
  closest shape but is API-age-specific. Ask the design owner for a generic
  `Badge` in `components/ui/`, or explicitly re-use `StatChip` with an empty
  label — one decision, one owner.

**Design tokens / components used:** hero total in `text-3xl tabular-nums`
(`DESIGN.md` reserves `text-3xl` for hero numbers only — this is the plan
editor's one hero, so item 01's headline must stay `text-xl`). Label above it
in uppercase `text-[10px] tracking-widest text-text-dim`. Badge: `success`
tone for "optimized", `warning` tone for "saves ≥ X" — paired with words,
never colour alone (`DESIGN.md` §6). `rounded-xs`, 1px `border-line`,
`bg-panel-2`. Sits inside the existing `Panel`, not a new nested Panel. No
`DataAgeBadge` (Editable Data). No new `primary` button.

**Tests:**

- `src/engine/optimizer/placeRemaps.test.ts` already has an equivalence suite
  for the `remapCount === 1` fast path (`describe('placeRemaps single-remap
fast path', ...)`) — no new engine test needed for item 05.
- `src/features/skills/planner/PlanHeader.test.tsx` — renders `formatDuration`
  of the total; badge reads "optimized" when savings are below threshold;
  badge reads the savings when above it; badge re-renders after a reorder,
  debounced.
- e2e: add to `e2e/plans.spec.ts` — after `addCaldariCruiserToNewPlan`
  (`e2e/support/planHelpers.ts`), assert the header total is visible and the
  badge shows one of the two states. No `mockEsi.ts` additions.

**i18n keys:** `plans.totalTrainingTime`, `plans.badgeOptimized`,
`plans.badgeSaves` ("Saves {{duration}}"), `plans.badgeTooltip`,
`plans.headerEntryCount`.

**Sync / Dexie impact:** none — derived display only.

**New ESI scopes:** none.

**Cost:** confirm **S**. The engine-side work (O(R) fast path, Booster
support, the `MAX_SUPPORTED_REMAPS = 2` cap) already shipped; what is left is
a header component, a badge, and a debounce. No Web Worker fork remains —
that was only needed for an exact live number at unbounded `remapCount`,
which the current cap makes moot.

**Depends on:** shares `RemapTimeline` and the savings threshold with **item
01** — land 01 first or together. No hard blocker.

**Risks / open questions:**

- Booster/optimizer disagreement: **already fixed**, not a risk (README
  §5.6, D5 shipped 2026-08-30) — the optimizer accounts for Boosters when a
  `BoosterContext` is supplied, matching `computeSchedule`, so the hero total
  and the badge agree.
- The badge contradicts the deliberate invalidation of the detailed segment
  list on every plan edit. Confirm the badge is allowed to stay live while
  the detailed segment list still clears on-demand — otherwise the two go
  stale at different rates and look broken.

---

## Item 08 — Skill priorities and priority bands

**Artifact claim:** "Missing. One field on the plan entry plus a sort that respects prereqs."

**Verdict:** CONFIRMED that it is missing — `grep -rn "priority\|Priority" src/features/skills src/engine src/db` returns zero matches, and `PlanEntry` is `{ skillTypeID, targetLevel }` only (`src/engine/types.ts:46-49`). But the task's framing of the cost is wrong in both directions: **no Dexie bump is needed** (`src/db/index.ts:38-43`), and **no `planSync.ts` change is needed** for a nested entry field (`src/sync/planSync.ts:350,362`).

**Verified baseline:**

- `PlanEntry = { skillTypeID: number; targetLevel: number }` — `src/engine/types.ts:46-49`.
- `SkillPlanRecord.entries: PlanEntry[]` — `src/db/index.ts:35`.
- Entry order is the _only_ priority signal today; ordering is manual drag
  (`EntryList.tsx`) via `reorderRows` (`markers.ts:75-88`).
- **A prereq-respecting topological emitter already exists and is reusable.**
  `src/engine/optimizer/reorderSuggestion.ts:79-115` `suggestReorder` implements
  exactly the "group, then repeatedly emit each group's ready steps" algorithm
  item 08 needs; the prereq machinery is `buildPlanIndex` (`:22-31`),
  `requirementMet` (`:34-43`), `isReady` (`:45-54`), `markEmitted` (`:56-63`).
  Its grouping key is hardcoded to `pairKey(skill.primary, skill.secondary)`
  (`:88`) and the helpers are module-private. There is also a ready-made
  validator, `isValidOrder` (`:66-76`), exported at `optimizer/index.ts:20`.
- Separately, `normalizePlan` (`src/engine/plan.ts:22-38`) already guarantees
  prereqs land ahead of dependents _in the computed queue_ — so item 08's
  prereq rule matters for the **entry list** the user sees and drags, not for
  training correctness.
- `applyReorderSuggestion` (`planner/reorder.ts:61-74`) already converts a
  suggested step order back into an entry order — the same adapter a
  priority sort needs.

**Gap:** the `priority` field, per-row priority UI, the group-by-priority
toggle, banded rendering, and a priority-keyed variant of the emitter.

**Engine vs UI split:**

- `src/engine/optimizer/reorderSuggestion.ts` — **refactor, TDD-required.**
  Extract `emitGroupedRespectingPrereqs(steps, skills, groupKey: (step) => string)`
  and reimplement `suggestReorder` as `emitGrouped(..., pairKey)`. Then a
  priority sort is `emitGrouped(..., priorityKey)`. Writing a second
  topological sort would duplicate `buildPlanIndex`/`isReady`/`markEmitted` and
  is the wrong call.
- `src/engine/optimizer/prioritySort.ts` (new, pure, TDD-required) —
  `sortByPriority(steps, skills, priorityOf)` → `PlanStep[]`, plus
  `bandsFor(steps, priorityOf)` → band boundaries.
- `src/features/skills/planner` — priority control per row, the band toggle,
  band headers, the entry↔step priority adapter.
- `src/db/index.ts` / `src/engine/types.ts` — the field declaration.

**The prereq-inserted-step problem (must be decided before coding):**
`suggestReorder` and `sortByPriority` operate on **normalized steps**, but
`priority` lives on **entries**. Prereq-inserted steps (`ComputedQueue` renders
them dimmed and labelled — `ComputedQueue.tsx:44,54-56`) have no entry and no
priority. Rule to adopt: **a prereq step inherits the minimum (most urgent)
priority of any entry that pulled it in.** This is exactly the step→entry
attribution mapping item 01 needs — same shared primitive, one owner.

**Files touched:**

- `src/engine/types.ts` — add `priority?: number` to `PlanEntry` (`:46-49`).
  Optional so existing plans stay valid without migration. Note this puts a
  planning concept on an engine type; the alternative (a parallel
  `SkillPlanRecord.priorities: number[]`, literally mirroring `markers`) keeps
  the engine type clean at the cost of positional fragility on every reorder
  and removal — see `markersAfterEntryRemoval` (`markers.ts:110-120`) for how
  much bookkeeping that costs. **Recommend the field on `PlanEntry`.**
  Orchestrator decision.
- `src/db/index.ts` — doc-comment the new entry field the way `markers` is
  documented (`:38-43`). **No `db.version(4)`.**
- `src/engine/optimizer/reorderSuggestion.ts` — extract the generic emitter.
- `src/engine/optimizer/index.ts` — export `sortByPriority`, `bandsFor`.
- `src/features/skills/planner/EntryList.tsx` — priority control per `EntryRow`
  (`:51-78`); band headers when grouping is on.
- `src/features/skills/planner/PlanEditor.tsx` — group-by-priority toggle in the
  toolbar Panel (`:342-405`); wire the sort through
  `applyReorderSuggestion` (`reorder.ts:61`).
- `src/features/skills/planner/reorder.ts` — `upsertEntry` (`:40-49`) and
  `dedupeEntries` (`:23-34`) must preserve/merge `priority` (dedupe currently
  rebuilds bare `{ skillTypeID, targetLevel }` objects at `:33` and would
  **silently drop priority** — this is the real bug to catch).
- `src/features/skills/planner/clipboardImport.ts`, `src/engine/queueImport.ts`
  — check that entries they mint get a default priority rather than `undefined`.
- `src/i18n/locales/en.json`.

**New modules:**

- `src/engine/optimizer/prioritySort.ts` (+ `.test.ts`) — priority-banded,
  prereq-valid step ordering.
- `src/features/skills/planner/PrioritySelect.tsx` — per-row priority control.
- `src/features/skills/planner/priorityBands.ts` (+ `.test.ts`) — entry-level
  band grouping for the list, and the entry↔step priority adapter.

**Shared primitives needed:**

- **The step→entry attribution mapping** (same one item 01 needs). Single owner.
- **A compact `Select`/segmented control.** None exists in `components/ui/` —
  every select today is a raw styled `<select>`
  (`PlanEditor.tsx:446-460`, `:449` for the class string). Adding a 4th inline
  copy is the wrong move; ask for a `Select` primitive.
- A **priority vocabulary decision**: numeric 1–5, or named tiers
  (Critical/High/Normal/Low)? Affects i18n keys and sort stability. Orchestrator
  call.

**Design tokens / components used:** band headers as uppercase `text-[10px]
tracking-widest text-text-dim` rows on `bg-panel-2` with a `border-line`
hairline — same treatment as the computed-queue header row
(`ComputedQueue.tsx:37-41`), which keeps the two lists visually consistent.
Priority control at `h-7`/`text-xs`, `rounded-xs`, `bg-panel-2`,
`border-line` — matching `PlanEditor.tsx:449` exactly. Do **not** colour-code
priorities with status tokens (`DESIGN.md` §5: status colours carry meaning);
use the band label as the signal. Toggle is a `ghost` `Button size="sm"` in the
existing toolbar row. No new `primary` button.

**Tests:**

- `src/engine/optimizer/reorderSuggestion.test.ts` — extend: the extracted
  generic emitter, driven with `pairKey`, still produces byte-identical output
  to today's `suggestReorder` (regression net for the refactor).
- `src/engine/optimizer/prioritySort.test.ts` — **TDD-required.** (1) higher
  priority sorts first; (2) a _low_-priority prerequisite is pulled ahead of its
  _high_-priority dependent — the headline requirement; (3) result passes
  `isValidOrder` (`reorderSuggestion.ts:66`); (4) equal priorities keep original
  relative order (stable); (5) entries with no priority land in a defined
  default band; (6) unsatisfiable prereqs throw the same error as
  `suggestReorder` (`:112`).
- `src/features/skills/planner/priorityBands.test.ts` — prereq step inherits the
  minimum priority of its dependents; bands with no entries are omitted.
- `src/features/skills/planner/reorder.test.ts` — extend: `dedupeEntries` and
  `upsertEntry` preserve `priority`; merging two rows for one skill keeps the
  more urgent priority.
- `src/sync/planSync.test.ts` — add a round-trip test mirroring the
  `markers field mapping` describe block added in `d90e417`
  (`planSync.test.ts:146-166`): push a plan whose entries carry `priority`,
  assert it survives push **and** pull, and assert **no entry object ever
  carries an explicit `undefined` priority key**.
- e2e (`e2e/plans.spec.ts`): set two priorities, toggle grouping, assert band
  headers and that a prereq entry appears above its dependent.

**i18n keys:** `plans.priority`, `plans.priorityLabel` ("Priority for
{{name}}"), `plans.priorityTooltip`, `plans.groupByPriority`,
`plans.priorityBand` ("Priority {{level}}"), `plans.priorityBandNone`, plus one
key per named tier if the named-tier option is chosen.

**Sync / Dexie impact — the corrected picture:**

- **Dexie:** no version bump. `priority` is never an index; `db.version(3)`
  (`src/db/index.ts:107`) is unchanged. This is the same reasoning already
  written down for `markers` at `src/db/index.ts:38-43`.
- **`src/sync/merge.ts`:** no change. `RemotePlanDoc.entries` is typed as
  `SkillPlanRecord['entries']` (`merge.ts:32`), so it widens automatically —
  unlike `markers`, which needed its own line (`merge.ts:34`).
- **`src/sync/planSync.ts`:** no change. `entries: p.entries` (`:350`) /
  `entries: r.entries` (`:362`) pass the array through in both directions.
- **The hazard that DOES carry over from `d90e417`:** Firestore rejects
  `undefined`, and that applies to values nested inside array elements too. The
  `...(p.markers !== undefined ? {...} : {})` guard at `planSync.ts:348-349`
  cannot protect a field buried inside `entries`. **Rule: never write
  `{ skillTypeID, targetLevel, priority: undefined }`.** Either always store a
  number (recommended — a `DEFAULT_PRIORITY` constant, with readers treating a
  missing key as the default for legacy rows), or omit the key entirely on
  construction. `dedupeEntries` (`reorder.ts:33`) is the highest-risk site: it
  rebuilds entry objects from scratch.
- **`firestore.rules`:** no change — rules never enumerate plan fields.

**New ESI scopes:** none.

**Cost:** confirm **M**, but the weight sits somewhere the task did not predict.
The sync work is ~0 and the Dexie work is ~0; the cost is the
`reorderSuggestion` refactor under TDD, the prereq-priority attribution
semantics, and the entry-list UI (a per-row control in a list that is already
juggling drag handles, Remap Markers, and remove buttons —
`EntryList.tsx:51-120`).

**Depends on:**

- **Item 01** (or whoever owns it) for the shared step→entry mapping. Not a hard
  block — whoever lands first builds it.
- No dependency on 05 or 10.

**Risks / open questions:**

- `PlanEntry` is an **engine** type (`docs/ARCHITECTURE.md` §2: engine types are
  "engine-native shapes, decoupled from SDE/ESI"). Adding a planning-UI concept
  to it is a small architectural smell. Alternative: a parallel array on
  `SkillPlanRecord`. Orchestrator decides; I recommend the field.
- Interaction with **Remap Markers**: markers are positional
  (`markers.ts:27-34` normalizes against entry positions). A group-by-priority
  reorder **moves entries and therefore silently relocates every marker**. Must
  decide: recompute marker positions, warn, or disable grouping while markers
  exist. This is the sharpest hidden risk in item 08.
- Grouping is described as a "toggle" (a view mode) but any accept-and-apply
  path rewrites `plan.entries`. CONTEXT.md is explicit that "reorder never
  applies silently" — so grouping must be either purely visual, or an
  accept/reject preview like `reorderPreview` (`PlanEditor.tsx:537-558`).

---

## Item 10 — Keyboard shortcuts

**Artifact claim:** "Missing entirely."

**Verdict:** PARTIALLY TRUE — no shortcut _system_ exists, but scattered key handling does. The two blockers the original teardown named ("settings" and "close" have no target) are now both resolved on `main`.

**Verified baseline — every key handler in `src/`:**

- `src/app/Layout.tsx`'s mobile More sheet renders through `Modal`
  (`components/ui/Modal.tsx`) — Escape/backdrop-close/focus-restore come from
  the native `<dialog>` (`showModal()`), not a hand-rolled window `keydown`
  listener. There is **no** app-level window `keydown` listener anywhere in
  `src/` today — a genuinely new piece of chrome for item 10's global
  shortcuts (new plan, move up/down), separate from Escape/focus-return,
  which `Modal` already owns for anything that opens through it.
- `src/components/ui/Tabs.tsx:21-36` — arrow-key roving tabstop.
- `src/features/skills/planner/PlanList.tsx:51-53` and
  `src/features/industry/BuildPlanList.tsx:54-56` — Enter/Escape on the rename
  input.
- `src/features/skills/planner/EntryList.tsx:142-145` — dnd-kit
  `KeyboardSensor` + `sortableKeyboardCoordinates`. **Reorder is already
  keyboard-driveable**, contrary to the task premise.

That is all. No registry, no shortcut help, no `Cmd`/`Ctrl` platform detection
anywhere in `src/`.

**Gap, and two blockers from the original teardown — both resolved on `main`:**

- **"Settings" now has a target.** `/settings` is routed (`src/app/App.tsx`,
  `src/routes/Settings.tsx`) — deliberately empty today ("the controls that
  will live here … each ship with their own feature"), but a real navigable
  route, not a dead binding. The shortcut can ship now: it just navigates.
- **"Close" is no longer ambiguous.** A `Modal` primitive exists
  (`components/ui/Modal.tsx`, exported from `components/ui/index.ts`) built on
  the native `<dialog>` (`showModal()`), and both existing overlays —
  `ImportClipboardDialog.tsx` and `Layout.tsx`'s `MobileMoreSheet` — already
  render through it rather than hand-rolling `role="dialog"`. "Close" means
  "close whichever `Modal` is currently open"; Escape already does this
  natively via the dialog's `cancel` event, so a global "close" shortcut only
  needs to know which `Modal.onClose` is active, if any.
- Shippable today without new dependencies: **new plan**, **move skill
  up/down**, the **shortcuts sheet**, **and now settings/close too**.

**Engine vs UI split:**

- `src/engine` — **nothing.** Keyboard matching is not domain calculation and
  `src/engine` is reserved for training/industry math
  (`docs/ARCHITECTURE.md` §2). Putting it there would misfile it.
- `src/lib/shortcuts.ts` — pure, dependency-free, colocated-test. `src/lib` is
  explicitly "small pure formatters/helpers shared across features with no other
  natural home" per the module map; this fits exactly. Not TDD-_required_ by
  CLAUDE.md (that rule names `src/engine`, `src/auth`, industry math), but it is
  pure logic and should be written test-first anyway.
- `src/app/` — the single window listener and the sheet, alongside the existing
  `Layout.tsx` Escape precedent.
- `src/features/skills/planner/` — the plan-scoped bindings (new plan, move
  up/down).

**Proposed module shape (testable without synthesizing DOM events):**

```
src/lib/shortcuts.ts
  export interface Chord { key: string; mod?: boolean; shift?: boolean; alt?: boolean }
  // `mod` = Cmd on macOS, Ctrl elsewhere.
  export function matchChord(chord: Chord, event: KeyEventLike, platform: Platform): boolean
  export function isTypingTarget(target: TargetLike): boolean
  export function formatChord(chord: Chord, platform: Platform): string   // "⌘N" | "Ctrl+N"

  // Structural params, NOT DOM types — the whole point of the seam:
  type KeyEventLike  = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
  type TargetLike    = { tagName: string; isContentEditable: boolean; type?: string }
  type Platform      = 'mac' | 'other'
```

Every unit test is then a plain object literal — no `KeyboardEvent`
construction, no jsdom quirks, and platform is a parameter rather than a
`navigator` sniff (which would be untestable and impure).

- `src/app/useShortcuts.ts` — one `window.addEventListener('keydown')` (new —
  no window-level `keydown` listener exists anywhere in `src/` today),
  consults `isTypingTarget` first, then dispatches through a registry of
  `{ id, chord, scope, run }`.
- `src/app/ShortcutsSheet.tsx` — the help sheet, rendering `formatChord`
  labels inside the existing `Modal` (`components/ui/Modal.tsx`), the same way
  `MobileMoreSheet` (`Layout.tsx`) already does. Escape, backdrop-close, and
  focus return come from `Modal` for free.

**Move up/down — reuse, don't rebuild.** `reorderRows(entries, markers, activeId, overId)`
(`markers.ts:75-88`) is a **pure two-string-id function**: it never touches
dnd-kit's event system (it only calls `arrayMove`). A keyboard handler needs
only the focused row's id and its neighbour's id, both available from
`buildRows(entries, markers)` (`markers.ts:41-57`). So yes — the existing
reorder code drives cleanly from a keyboard handler, no refactor required.

**Files touched:**

- `src/app/Layout.tsx` — mount `useShortcuts`; add the help/shortcuts trigger
  (there is no help menu today — this is new chrome, needs a design decision on
  where it lives in the rail).
- `src/features/skills/planner/EntryList.tsx` — per-row move-up/down keyboard
  handling and `aria-keyshortcuts` on the row.
- `src/features/skills/planner/PlanEditor.tsx` / `src/routes/SkillPlans.tsx` —
  register the plan-scoped bindings (new plan → `SkillPlans.handleCreate`,
  `SkillPlans.tsx:121-127`).
- `src/i18n/locales/en.json`.

**New modules:**

- `src/lib/shortcuts.ts` (+ `shortcuts.test.ts`) — pure chord matching, typing
  guard, OS-correct labels.
- `src/app/useShortcuts.ts` (+ `.test.tsx`) — single window listener + registry.
- `src/app/ShortcutsSheet.tsx` (+ `.test.tsx`) — the help sheet.
- `src/app/shortcutRegistry.ts` — the declarative binding list (id, chord,
  scope, i18n key) that both the dispatcher and the sheet read, so the sheet can
  never drift from what actually fires.

**Shared primitives needed:**

- No new `Modal`/`Dialog` primitive needed — it already exists
  (`components/ui/Modal.tsx`), and both current overlays
  (`ImportClipboardDialog.tsx`, `MobileMoreSheet` in `Layout.tsx`) already
  render through it. The shortcuts sheet should be a third `Modal` consumer,
  not a new hand-rolled overlay.
- A **help-menu affordance** in `Layout.tsx` — new chrome, needs a design owner.
- **Platform detection** (`'mac' | 'other'`) as a single injected value so
  nothing sniffs `navigator` at three call sites.

**Design tokens / components used:** sheet on `bg-panel` with
`shadow-lg shadow-black/50` (`DESIGN.md` §5 — the one sanctioned shadow case,
for popovers/menus), `rounded-xs`, `border-line` hairline rows, uppercase
`text-[10px] tracking-widest text-text-dim` group headings ("Plan", "Global"),
chord glyphs in `bg-panel-2 border-line rounded-xs px-1 text-[11px]`. Trigger is
a `ghost` `Button size="sm"`. No new `primary` button. No `DataAgeBadge`.

**Accessibility (explicit requirements):**

- `isTypingTarget` must suppress every binding while focus is in an `input`,
  `textarea`, `select`, or a `contenteditable` element. The plan editor is full
  of them: the rename input (`PlanList.tsx:51`), the remap-count spinbutton
  (`PlanEditor.tsx:351-360`), the booster number/datetime inputs (`:476`,
  `:487`), the skill search field, the clipboard textarea.
- **Do not bind bare Arrow or Space at window level.** dnd-kit's
  `KeyboardSensor` (`EntryList.tsx:144`) owns those during an active drag; a
  global handler would fight it. Use `mod`-qualified chords for move-up/down.
- The shortcuts sheet must be reachable **without** its own shortcut — a visible
  trigger in the chrome — and must be listed in the sheet itself.
- Rows that respond to move-up/down carry `aria-keyshortcuts` so screen readers
  announce them; a reorder announcement should go through an
  `aria-live="polite"` region (the pattern already exists at
  `PlanEditor.tsx:431` for the import confirmation).
- Escape/focus-return behaviour is already handled natively for any `Modal`
  (`Modal.tsx`: `showModal()` + `onCancel` + focus restore on close) — the
  shortcuts sheet should render through `Modal` rather than reimplementing
  Escape/focus handling.

**Tests:**

- `src/lib/shortcuts.test.ts` — write test-first. `matchChord` maps `mod` to
  `metaKey` on `'mac'` and `ctrlKey` on `'other'`; a Ctrl press on mac does
  **not** match a `mod` chord (and vice versa); `isTypingTarget` returns true for
  `INPUT`/`TEXTAREA`/`SELECT`/`isContentEditable` and false for `BUTTON`/`DIV`;
  `formatChord` yields `⌘N` vs `Ctrl+N`, `⇧` vs `Shift+`.
- `src/app/useShortcuts.test.tsx` — fires while focus is on a button; does not
  fire while focus is in a text input; unregisters on unmount; two handlers for
  the same chord in different scopes do not both fire.
- `src/app/ShortcutsSheet.test.tsx` — every registry entry appears; Escape
  closes and returns focus to the trigger; labels change with platform.
- `src/features/skills/planner/EntryList.test.tsx` (new file — none exists
  today) — move-up/down calls `onReorder` with the correct neighbour id pair,
  and is a no-op at the list ends.
- e2e (`e2e/plans.spec.ts`): press the new-plan chord, assert a plan appears;
  open the shortcuts sheet from the help trigger. No `mockEsi.ts` additions.

**i18n keys:** `shortcuts.title`, `shortcuts.open` (help-menu label),
`shortcuts.close`, `shortcuts.groupGlobal`, `shortcuts.groupPlan`,
`shortcuts.newPlan`, `shortcuts.moveUp`, `shortcuts.moveDown`,
`shortcuts.movedAnnouncement` ("Moved {{name}} to position {{position}}"),
`shortcuts.hint`, `shortcuts.settings`.

**Sync / Dexie impact:** none as scoped. If shortcuts ever become
user-remappable, that is Editable Data and must go through a
`sync.`-prefixed setting via `setSyncedSetting` (`planSync.ts` public API) —
out of scope, worth a note in the module docstring.

**New ESI scopes:** none.

**Cost:** confirm **S** for the whole item — {new plan, move up/down,
shortcuts sheet, registry, OS labels, settings, close}. Neither "settings" nor
"close" is blocked on missing infrastructure anymore (`/settings` is routed,
`Modal` exists), so there's no reason to split them out as a separate,
larger-cost follow-up.

**Depends on:** nothing hard. `Modal` already exists and `/settings` is
already routed, so neither the "close" nor "settings" binding is blocked on
another item anymore. No dependency on 01, 05, or 08.

**Risks / open questions:**

- Chord collisions with the browser. `Cmd/Ctrl+N` opens a new browser window and
  **cannot be intercepted** in most browsers — "new plan" needs a different
  chord (`Cmd+Shift+N` is also taken; consider a non-mod key like `n` while not
  typing, matching the GitHub/Linear convention).
- Where does the help trigger live in `Layout.tsx`? It has no overflow/help slot
  on desktop, and mobile is already at 4 tabs + More (`Layout.tsx:211-239`).
- Does the app want a global shortcut layer at all, or only plan-editor-scoped
  shortcuts? A global layer is more work and more collision surface.

---

## Cross-cutting: should items 01 and 05 share one component/hook?

**Share the renderer; do NOT share the compute.**

- **One shared component: `RemapTimeline`.** It should be the single reader of a
  `PlaceRemapsResult`, replacing the private `renderSegments`
  (`PlanEditor.tsx:263-292`) and serving **three** call sites, not two:
  `optimizeResult` (`:503`), `markersResult` (`:520`), and item 01's timeline.
  Both optimize modes already return the identical type
  (`optimizeAtMarkers.ts:14` imports `PlaceRemapsResult` rather than defining
  its own), so this is free.
- **A shared "always run `placeRemaps`" hook is no longer a risk.** Both the
  O(R) `remapCount === 1` path and the `MAX_SUPPORTED_REMAPS = 2` cap already
  shipped (README §5.6), so `placeRemaps` itself is now cheap enough for item
  05's live badge (~6-419 ms at the current cap) as well as item 01's
  on-demand call — no separate bounding module, no Web Worker. Item 05 can
  call the same `placeRemaps` item 01 does, just behind a trailing debounce.
- **Two things they must genuinely share**, and the orchestrator should assign
  one owner each: `MIN_MEANINGFUL_SAVINGS_SECONDS` (`PlanEditor.tsx`), and the
  step→entry index mapping (also needed by item 08).
- **The booster/optimizer disagreement this used to flag is fixed.** The
  optimizer now accounts for Boosters whenever a `BoosterContext` is supplied
  (`bestAttributes.ts`'s docstring), matching what the computed queue already
  applied. Shipped as D5, README §5.6 — items 01 and 05 can put both numbers
  in the same header without a caveat.
