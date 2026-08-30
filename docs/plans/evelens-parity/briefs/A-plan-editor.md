# Brief A — Skill Plan editor & remap optimizer UX

Branch `feat/evelens-parity-plan`. Items 01, 05, 08, 10.
Read-only investigation. All measurements below were run against the real
`src/engine/optimizer` code via a throwaway vitest config in the scratchpad
(not committed).

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

Two further doc-vs-code staleness findings (both refuted by `main`):
`docs/ARCHITECTURE.md` §6 still calls Remap Markers "in flight — no `Marker`
implementation found in `src/` yet" (contradicted by
`src/features/skills/planner/markers.ts`, 142 lines, shipped in `954eb16`), and
`src/engine/optimizer/placeRemaps.ts:18` claims the memoization keeps
"~200-step plans fast" — measured below, that is false for realistic plans.

---

## Measured optimizer cost (drives items 01 and 05)

`placeRemaps` is O(R²) segment evaluations where **R = number of maximal
attribute-pair runs**, not number of steps (`placeRemaps.ts:86-93` merges
consecutive same-pair steps into one run). Each segment evaluation brute-forces
2,885 attribute allocations (`bestAttributes.ts:63-75`; verified by counting).
Signature memoization (`placeRemaps.ts:121-139`) rarely hits, because every
`[i,j)` interval has a distinct SP-per-pair signature.

Randomized realistic plans, Node, warm, mean of 3 (`remapCount: 3`):

| pair runs R | steps | `placeRemaps` |
| ----------- | ----- | ------------- |
| 25          | 25    | 145 ms        |
| 46          | 50    | 624 ms        |
| 91          | 100   | 3,141 ms      |
| 145         | 150   | 9,006 ms      |

Confirmed independent of step count: 100 entries × 5 levels each = 500 steps but
only 100 runs → 3,119 ms; 20 entries × 5 levels = 100 steps / 20 runs → 70 ms.
`optimizeAtMarkers` is cheap by comparison (1–2 ms at every size) because it
does one `bestAttributesForPairs` per user-placed marker, not O(R²).

**`placeRemaps` is quadratic even when it needn't be.** For `remapCount === 1`
only the last DP column is needed (`dp[1][R] = min_i (currentPrefix[i] + segment[i][R])`),
i.e. R+1 suffix evaluations, O(R). `placeRemaps.ts:120-140` builds the whole
O(R²) table regardless of `remapCount`. Measured, exact-equal savings in every
case:

| pair runs R | O(R) suffix scan | `placeRemaps(remapCount: 1)` | savings identical? |
| ----------- | ---------------- | ---------------------------- | ------------------ |
| 24          | 16 ms            | 103 ms                       | yes                |
| 48          | 31 ms            | 641 ms                       | yes                |
| 97          | 86 ms            | 3,325 ms                     | yes                |
| 145         | 125 ms           | 8,175 ms                     | yes                |
| 236         | 223 ms           | 24,061 ms                    | yes                |

CONTEXT.md round 2 names the single-remap case as the one the optimizer "must
support", and `SkillPlans.tsx:123` prefills new plans from
`remapInfo.available`, so this is the common path. `remapCount ≥ 2` genuinely
needs the full table (`dp[2][j]` depends on `dp[1][i]` for all `i`), so the
split is exactly at K = 1.

**Cheap bounds for the K ≥ 2 case** (verified empirically, see item 05):

| R   | whole-plan best (lower bound) | per-run best (upper bound) | exact `placeRemaps` |
| --- | ----------------------------- | -------------------------- | ------------------- |
| 25  | 2.1 ms                        | 2.7 ms                     | 145 ms              |
| 46  | 1.0 ms                        | 3.2 ms                     | 624 ms              |
| 91  | 1.1 ms                        | 6.4 ms                     | 3,141 ms            |
| 145 | 1.2 ms                        | 11.0 ms                    | 9,006 ms            |

In all four runs `lowerBound ≤ actualSavings ≤ upperBound` held. **But the upper
bound is far too loose to prove "optimized"** — at R = 91 it read 11.1 Ms
against an actual 4.1 Ms. `Σ perRunBest` assumes every run gets its own private
remap, so for any plan spanning more than one attribute pair the bound never
approaches `currentSeconds`. It is useful as a "how much headroom might exist"
signal, never as proof that no remap helps.

---

## Item 01 — Explain the remap schedule

**Artifact claim:** "We have the engine, not the story. `engine/optimizer/placeRemaps` and `bestAttributes` already compute this, and `PlaceRemapsResult` already returns per-segment attributes and duration, `savingsSeconds`, and a no-remap segment when a remap gains nothing — every value the timeline needs. Pure UI work, no engine change."

**Verdict:** PARTIALLY TRUE — the per-field claims are all correct, but "every value the timeline needs" is not: the projected finish date and the step-index→plan-row mapping for inline dividers do not exist anywhere (`src/engine/optimizer/placeRemaps.ts:39-45`). Neither forces an _engine_ change; both need new non-engine code.

**Verified baseline (field by field):**

| Timeline value                                                  | Present?  | Citation                                                                                                                                                                                  |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| per-segment attributes                                          | YES       | `placeRemaps.ts:32` (`RemapSegment.attributes: Attributes`)                                                                                                                               |
| per-segment duration                                            | YES       | `placeRemaps.ts:33` (`seconds`)                                                                                                                                                           |
| per-segment start/end step                                      | YES       | `placeRemaps.ts:30-32` (`startIndex`/`endIndex`, inclusive)                                                                                                                               |
| "this segment is a remap" flag                                  | YES       | `placeRemaps.ts:36` (`remap: boolean`; leading current-attrs segment is `false`)                                                                                                          |
| `savingsSeconds`                                                | YES       | `placeRemaps.ts:44`                                                                                                                                                                       |
| no-remap-is-better case                                         | YES       | `placeRemaps.ts:100-113` `noRemapResult()`, taken at `:115` (`remapCount<=0`) and `:181` (current attrs already ≥ best reachable)                                                         |
| baseline for "% faster"                                         | YES       | `placeRemaps.ts:43` `currentSeconds` — `savings/currentSeconds` is the percentage, no new field needed                                                                                    |
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

- **Booster/optimizer disagreement becomes visible. RESOLVED — (a).** `bestAttributes.ts:7`
  states boosters are ignored by design and "the schedule layer applies those
  separately", but `computeSchedule` _does_ apply them
  (`PlanEditor.tsx:92-96`). Today `optimizeResult.currentSeconds` and the
  computed-queue `totalSeconds` (`PlanEditor.tsx:206`) sit in different panels
  so the mismatch is invisible. Items 01 and 05 put them side by side.
  Ruled (README §5.5): the optimizer keeps ignoring Boosters and says so —
  an explicit "excludes booster" note wherever the two numbers share a header.
  No engine change. One wording, shared by both items.
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

**Verdict:** PARTIALLY TRUE — total time is genuinely one line away, the badge is not. A live "optimized / would still save X" verdict requires running `placeRemaps`, which I measured at 624 ms at 46 pair runs and 3.1 s at 91 (`src/engine/optimizer/placeRemaps.ts:120-170`). "Surfacing only" is wrong about half the feature.

**Verified baseline:**

- Total training time already exists as
  `const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0`
  (`PlanEditor.tsx:206`) and is already rendered — as an 11px dim string in the
  computed-queue Panel's `actions` slot (`PlanEditor.tsx:560-562`). "Large type"
  is a move + a type-scale change, nothing more.
- `scheduled` is properly memoized on
  `[plan.entries, catalog, trainedSkills, attributes, effectiveImplants, activeBoosters]`
  (`PlanEditor.tsx:169-180`). `computeSchedule` is O(steps) and cheap.
- Optimizer results are **not** live: they only exist after a button press
  (`:238-258`) and are explicitly wiped on any entries/markers change
  (`:190-200`). Item 05 inverts that invalidation design.
- No `Worker`, `requestIdleCallback`, or debounce utility exists anywhere in
  `src/` — checked.

**Gap:** the badge, the type-scale/placement change, and a recompute strategy
that does not block the main thread.

**Recompute / perf — the actual finding:**

Debouncing does not fix the O(R²) pass — it only delays a 3-second freeze;
`useMemo` never helps either, because every reorder mints a fresh `entries`
array. The fix is to not run the O(R²) pass for the badge at all.

**`remapCount === 1` (the common case, and the default from `SkillPlans.tsx:123`):
compute the EXACT answer in O(R).** Only the last DP column is needed; a
right-to-left suffix scan gives R+1 `bestAttributesForPairs` calls instead of
O(R²). Measured **86 ms at R = 97**, 125 ms at R = 145, 223 ms at R = 236, with
savings **identical to `placeRemaps(remapCount: 1)`** at every size (table
above). At that cost a trailing debounce (~150 ms) is genuinely sufficient. All
three badge states are then provable, because the number is exact:

- savings < `MIN_MEANINGFUL_SAVINGS_SECONDS` → **"optimized"**
- savings ≥ threshold → **"saves {{duration}}"**
- (no third state needed)

**`remapCount ≥ 2`: the exact answer is not cheaply available.** Fall back to
the bounds, and be honest about what they prove:

- **Lower bound on savings** = `currentSeconds − bestAttributesForPairs(whole plan).seconds`.
  Sound because a single whole-plan segment is always a feasible DP solution
  (`placeRemaps.ts:163`, `k = 1`), so `totalSeconds ≤ bestWholePlan`. **1–2 ms.**
  Supports **"saves at least {{duration}}"**.
- **Upper bound** = `currentSeconds − Σ bestAttributesForPairs(run).seconds`.
  Sound, but far too loose to prove "optimized" (11.1 Ms vs an actual 4.1 Ms at
  R = 91) — `Σ perRunBest` assumes a private remap per run, which no real plan
  approaches. **Do not wire "optimized" to it.**
- So for K ≥ 2 the honest states are **"saves at least X"** or **"a remap pass
  may help"** + the existing on-demand button. If the K ≥ 2 badge must also say
  "optimized", note that the K = 1 exact value is a valid _lower_ bound on the
  K ≥ 2 savings (more remaps never hurt): if K = 1 already finds a real gain,
  the badge can state it without running the full pass. Only the case "K = 1
  finds nothing, K ≥ 2 might" stays genuinely unknown — and that is a narrow,
  honestly-labelled third state, not the common one.

Do **not** claim "optimized" from the whole-plan lower bound alone:
`currentAttributes` can sit outside the 17..27 remap space (ESI attributes
include implants — `docs/ARCHITECTURE.md` §4), so a multi-segment plan can beat
current even when the single-segment best does not.

If the orchestrator wants the exact number live for **K ≥ 2 as well**: that is a
Web Worker (none in the repo — new infrastructure, new test harness) and the
item becomes **M**.

**Bonus engine win, cheap and independent:** teaching `placeRemaps` itself to
take the O(R) path when `remapCount === 1` turns 24 s into 223 ms at R = 236 for
the _existing_ "Optimize remaps" button, with provably identical output. Worth
doing regardless of the badge.

**Engine vs UI split:**

- `src/engine/optimizer/placeRemaps.ts` — **new O(R) fast path for
  `remapCount === 1`, TDD-required.** Either as an internal branch in
  `placeRemaps` or as an exported `placeSingleRemap`. Its correctness test is
  cheap and total: for generated plans, `placeSingleRemap` must equal
  `placeRemaps(..., { remapCount: 1 })` field for field (verified true at
  R = 24/48/97/145/236 in the scratchpad harness).
- `src/engine/optimizer/savingsBounds.ts` — **new, pure, TDD-required**, for the
  `remapCount ≥ 2` fallback only. `savingsBounds(steps, skills, { currentAttributes, implants })` →
  `{ currentSeconds, lowerBoundSavings, upperBoundSavings }`. Belongs in engine:
  same math as `placeRemaps`, and its soundness is a property that must be
  tested against `placeRemaps` itself.
- Both need the private run segmentation from `placeRemaps.ts:74-94`. Extract it
  once as `pairRuns(steps, skills, currentAttributes, implants)` →
  `{ pair, sp, currentSeconds, startStep, endStep }[]` — note the **baseline
  seconds per run depend on `currentAttributes` and `implants`**, so a
  `pairRuns(steps, skills)` signature cannot reproduce what that loop produces;
  either widen the signature as shown, or split into a pure grouping pass plus a
  separate baseline pass.
- `src/features/skills/planner` — header component, badge, threshold constant.
- `src/routes/SkillPlans.tsx` — unchanged.

**Files touched:**

- `src/engine/optimizer/placeRemaps.ts` — extract the run-building loop
  (`:74-94`) into `pairRuns`; add the O(R) `remapCount === 1` path. Keep
  `placeRemaps.test.ts` green as the regression net. **Also fix the stale
  docstring at `:18`** ("keeping ~200-step plans fast") — measured false: 9.0 s
  at R = 145, 24 s at R = 236.
- `src/engine/optimizer/index.ts` — export `savingsBounds` (+ `placeSingleRemap`
  if it lands as a separate function) and their result types.
- `src/features/skills/planner/PlanEditor.tsx` — move `totalSeconds` into a new
  header component; drop the duration from the computed-queue `actions` slot
  (`:562`); export/relocate `MIN_MEANINGFUL_SAVINGS_SECONDS` (`:47`).

**New modules:**

- `src/engine/optimizer/savingsBounds.ts` (+ `.test.ts`) — cheap sound bracket
  on remap savings.
- `src/features/skills/planner/PlanHeader.tsx` — plan name, hero total time,
  optimization badge, count of entries.
- `src/features/skills/planner/optimizerThresholds.ts` — the shared
  "meaningful savings" constant (or fold into the engine module).

**Shared primitives needed:**

- `MIN_MEANINGFUL_SAVINGS_SECONDS` promoted out of `PlanEditor.tsx:47` — items
  01 and 05 both branch on it.
- `pairRuns(steps, skills, currentAttributes, implants)` shared between
  `placeRemaps`, the K = 1 fast path, and `savingsBounds` (see the signature
  caveat above — the per-run baseline is attribute-dependent).
- A **badge/pill** primitive. `StatChip` (`components/ui/StatChip.tsx`) is
  label+value; the badge is a single toned word/phrase. `DataAgeBadge` is the
  closest shape but is API-age-specific. Ask the design owner for a generic
  `Badge` in `components/ui/`, or explicitly re-use `StatChip` with an empty
  label — one decision, one owner.

**Design tokens / components used:** hero total in `text-3xl tabular-nums`
(`DESIGN.md` §2 reserves `text-3xl` for hero numbers only — this is the plan
editor's one hero, so item 01's headline must stay `text-xl`). Label above it in
uppercase `text-[10px] tracking-widest text-text-dim`. Badge: `success` tone for
"optimized", `warning` tone for "saves ≥ X", `text-dim` for "may help" —
paired with words, never colour alone (`DESIGN.md` §6). `rounded-xs`, 1px
`border-line`, `bg-panel-2`. Sits inside the existing `Panel`, not a new nested
Panel. No `DataAgeBadge` (Editable Data). No new `primary` button.

**Tests:**

- `src/engine/optimizer/placeRemaps.test.ts` — **TDD-required.** Add: for
  generated plans of increasing R, the `remapCount === 1` fast path returns a
  result field-for-field equal to the existing full-DP path.
- `src/engine/optimizer/savingsBounds.test.ts` — **TDD-required.** Key
  assertions: (1) property test over several generated plans that
  `lowerBoundSavings ≤ placeRemaps(...).savingsSeconds ≤ upperBoundSavings`;
  (2) empty plan → all zeros; (3) current attributes already optimal → lower
  bound ≤ 0; (4) attributes outside 17..27 (implant-inflated, the case
  `placeRemaps.ts:178-181` guards) do not make the bounds unsound.
- `src/features/skills/planner/PlanHeader.test.tsx` — renders `formatDuration`
  of the total; badge reads "optimized" when the upper bound is below threshold;
  badge reads the savings when the lower bound is above it; badge re-renders
  after a reorder.
- e2e: add to `e2e/plans.spec.ts` — after `addCaldariCruiserToNewPlan`
  (`e2e/support/planHelpers.ts`), assert the header total is visible and the
  badge has one of the three states. No `mockEsi.ts` additions.

**i18n keys:** `plans.totalTrainingTime`, `plans.badgeOptimized`,
`plans.badgeSaves` ("Saves {{duration}}" — exact, K = 1),
`plans.badgeCouldSave` ("Saves at least {{duration}}" — bounded, K ≥ 2),
`plans.badgeMayHelp`, `plans.badgeTooltip` (says whether the number is exact or
a floor, and that the button computes the full placement),
`plans.headerEntryCount`.

**Sync / Dexie impact:** none — derived display only.

**New ESI scopes:** none.

**Cost:** confirm **S**. The O(R) single-remap path is a contained engine change
with a trivial equivalence test, and it makes the badge exact for the default
`remapCount`. **M** only if the orchestrator requires an exact live number for
`remapCount ≥ 2` too (Web Worker + new test infrastructure).

**Depends on:** shares `RemapTimeline` and the savings threshold with **item
01** — land 01 first or together. No hard blocker.

**Risks / open questions:**

- Same booster/optimizer mismatch as item 01: the hero total _includes_ booster
  effects (`computeSchedule`, `PlanEditor.tsx:92-96`) while the badge's engine
  math _excludes_ them (`bestAttributes.ts:7`). **RESOLVED — (a)**, README §5.5:
  the badge carries the "excludes booster" note; the engine is left alone.
  Same wording as item 01 — write it once, use it in both.
- For `remapCount ≥ 2` the badge can only say "saves at least X" or "may help" —
  **"optimized" is not cheaply provable there**. Acceptable, or does the badge
  need the exact number at every `remapCount`? That is the S-vs-M fork.
- The badge contradicts the deliberate invalidation at `PlanEditor.tsx:182-200`.
  Confirm the badge is allowed to stay live while the detailed segment list
  still clears — otherwise the two go stale at different rates and look broken.

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

**Verdict:** PARTIALLY TRUE — no shortcut _system_ exists, but scattered key handling does, and two of the four named shortcuts have **no target to bind to**.

**Verified baseline — every key handler in `src/`:**

- `src/app/Layout.tsx:124-133` — window `keydown` listener, Escape closes the
  mobile More sheet and restores focus. The only window-level handler in the app,
  and the closest thing to a precedent.
- `src/components/ui/Tabs.tsx:21-36` — arrow-key roving tabstop.
- `src/features/skills/planner/PlanList.tsx:51-53` and
  `src/features/industry/BuildPlanList.tsx:54-56` — Enter/Escape on the rename
  input.
- `src/features/skills/planner/EntryList.tsx:142-145` — dnd-kit
  `KeyboardSensor` + `sortableKeyboardCoordinates`. **Reorder is already
  keyboard-driveable**, contrary to the task premise.

That is all. No registry, no shortcut help, no `Cmd`/`Ctrl` platform detection
anywhere in `src/`.

**Gap, and two blockers:**

- **"Settings" has no target.** There is no settings route
  (`src/app/App.tsx:69-89` lists every route: login, callback, characters,
  overview, skills, skills/plans, industry, market, wallet, assets, mail,
  calendar, contracts, orders, styleguide), no settings panel, no settings
  component. Descope, or declare a dependency on whichever item introduces one.
- **"Close" is ambiguous.** There is no modal system: `components/ui/index.ts`
  has no `Modal`/`Dialog`, and `ImportClipboardDialog.tsx` is a one-off
  (`role`/focus-trap not centralized). "Close" could mean close the dialog,
  close the plan, or close the More sheet. Orchestrator must define it.
- Shippable today without new dependencies: **new plan**, **move skill up/down**,
  and the **shortcuts sheet**.

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

- `src/app/useShortcuts.ts` — one `window.addEventListener('keydown')`
  (mirroring `Layout.tsx:131`), consults `isTypingTarget` first, then dispatches
  through a registry of `{ id, chord, scope, run }`.
- `src/app/ShortcutsSheet.tsx` — the help sheet, rendering
  `formatChord` labels. Reuse the `MobileMoreSheet` structure
  (`Layout.tsx:49-110`): `role="dialog" aria-modal="true"`, focus the first
  element on mount, Escape closes and returns focus to the trigger.

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

- A **`Modal`/`Dialog`** primitive in `components/ui/`. Three ad-hoc overlays
  now exist (`ImportClipboardDialog.tsx`, `MobileMoreSheet` in `Layout.tsx`, and
  the shortcuts sheet would be the third), each hand-rolling `role="dialog"`,
  Escape, and focus return. Ask the design owner. Also unblocks the "close"
  shortcut.
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
- Escape/focus-return behaviour must match the existing precedent at
  `Layout.tsx:124-133`.

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
`shortcuts.hint`, plus `shortcuts.settings` **only if** item 10 keeps the
settings binding.

**Sync / Dexie impact:** none as scoped. If shortcuts ever become
user-remappable, that is Editable Data and must go through a
`sync.`-prefixed setting via `setSyncedSetting` (`planSync.ts` public API) —
out of scope, worth a note in the module docstring.

**New ESI scopes:** none.

**Cost:** confirm **S** for {new plan, move up/down, shortcuts sheet, registry,
OS labels}. The "settings" and "close" bindings are **not** S — they are blocked
on infrastructure that does not exist, and should be split out.

**Depends on:**

- A `Modal`/`Dialog` primitive (or an explicit decision to hand-roll a third
  overlay) before the "close" shortcut can mean anything.
- Whatever item introduces a Settings surface, before the settings shortcut can
  be bound.
- No dependency on 01, 05, or 08.

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
- **A shared "always run `placeRemaps`" hook would be a mistake.** Item 01 is
  on-demand and can afford the full O(R²) pass at any `remapCount`; item 05 is
  live-on-every-drag, and the full pass measures 624 ms / 3.1 s / 9.0 s at
  R = 46 / 91 / 145. One hook forces either a frozen UI or a lazy timeline.
  Give item 05 the O(R) single-remap path (86 ms at R = 97, exact) plus
  `savingsBounds` for `remapCount ≥ 2`, and let item 01 keep the exact call.
- **Four things they must genuinely share**, and the orchestrator should assign
  one owner each: `MIN_MEANINGFUL_SAVINGS_SECONDS` (`PlanEditor.tsx:47`), the
  `pairRuns` segmentation extracted from `placeRemaps.ts:74-94`, the O(R)
  single-remap path (item 05 needs it live, item 01 benefits from it on the
  existing button — 24 s → 223 ms at R = 236), and the step→entry index mapping
  (also needed by item 08).
- **One shared bug they both expose:** the optimizer ignores boosters by design
  (`bestAttributes.ts:7`) while the computed queue applies them
  (`PlanEditor.tsx:92-96`). Invisible today because the numbers live in separate
  panels; items 01 and 05 put them in the same header. **Resolved — README §5.5
  option (a): disclose the exclusion, don't change the engine.**
