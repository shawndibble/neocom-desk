# Spec — Build Groups + Fit Import

Refined against two rounds of hostile review; every claim below was verified
against the code and carries its citation. This is the spec `/implement` works
from.

## The ask

Paste a ship fit into the Industry page and get a **group** holding one Build
Plan per buildable item. Each member opens and edits exactly like a normal
Build Plan. Opening the group shows every material across all members added up,
with costs and fees totalled.

## Vocabulary

- **Build Group** — a named, user-created collection of Build Plans belonging
  to one Character, which also totals as one. Membership is exclusive; groups
  do not nest.
- **Fit Import** — the paste action that parses EFT fit text and creates a
  Build Group with one Build Plan per buildable item.
- **Group Rollup** — the aggregate view: merged materials, summed costs.

"Group" alone is already twice-loaded in `CONTEXT.md` (**Market Group**, and an
item's **Group**), so the bare word is never used unqualified in code or copy.

## Data model — no new table

**Membership** is `buildGroupId?: string` on `BuildPlanRecord`. Additive and
unindexed, so **no Dexie version bump** — the same treatment as `buildHere`,
`materialSourcing` and `ownedStockScope` (`src/db/index.ts:246-270`).

**Names, order, and empty-group existence** live in one allow-listed synced
setting, `sync.industryBuildGroups`:

```ts
Record<number /* characterId */, { id: string; name: string; order: number }[]>;
```

The per-Character-map-inside-one-key shape is established, not invented:
`SyncedFeedPrefs.perCharacter`, `CustomsOverrides`, and `LastOpenedPlanValue`
all do this. It is required, because the local settings read is unfiltered
across Characters (`planSync.ts:1338-1340`) and the allow-list is exact-match.

Membership lives **only** on the plan — one writer per fact, so no merge can
put a plan in two groups. This mirrors `MiningTaxAssignmentRecord.groupId`
(`src/db/index.ts:499-508`), the repo's existing grouping-of-synced-records,
which is a bare shared id with no group table and whose docstring supplies the
dangling-reference rule reused verbatim below.

### Why not a `buildGroups` table

A new synced subcollection costs **nine** files, five of them hand-maintained
lists with no enforcement — and one of them is a live grenade:

`firestore.rules` ends in `// Everything else: implicit deny.` A new
subcollection is denied until someone hand-runs `firebase deploy --only
firestore`; CI deploys nothing. `permission-denied` is not `failed-precondition`,
so `pullOwnedDocs`' degradation catch re-throws (`planSync.ts:611-633`), and
`syncCharacter` awaits ten collections **sequentially with no per-collection
try/catch** (`planSync.ts:1312-1322`). One denied collection therefore takes
down the entire sync pass — Skill Plans included — for every Character, on
every pass, until a human remembers the deploy. Nothing in CI tests
`firestore.rules`.

The settings-blob avoids all nine. It also dodges tombstone expiry: deleting a
group is _removing an entry from a blob_, never a document delete, so the
30-day tombstone TTL (`merge.ts:194`) that could resurrect a deleted group is
never entered.

**Accepted cost, stated plainly:** `mergeSettings` is whole-value LWW per key
(`merge.ts:459-531`), so two devices creating _different_ groups concurrently
lose one creation. Membership is not in the blob, so what can be lost is a name
and an ordinal — never which plans are in which group. A lost name is
recoverable in seconds; a plan silently landing in the wrong group is not.

**Naming:** the field is `buildGroupId`, not `groupId` — `groupId` already
means something else on a record in the same module (`db/index.ts:508`).

### The one non-negotiable test

`RemoteBuildPlanDoc = BuildPlanRecord & RemoteDoc` (`merge.ts:59`), so
`buildGroupId` appears on the remote type **for free, with no compile error** —
but `CollectionSpec.toRemoteDoc` is contractually a hand-written field list
("explicit field list — never spread", `planSync.ts:515`) enumerating 18 fields
at `planSync.ts:764-827`. Omit it there and group membership is silently
dropped on push _and_ pull, with every test still green, surfacing weeks later
as "my groups vanished on my other device". A test must pin `buildGroupId`
through both `toRemoteDoc` and `toLocalRecord`.

## Fit Import

### Parsing and aggregation — one pass

`parseEftFit` is **not modified**. Two reasons, and the first is not the one
originally assumed:

1. `clipboardImport.ts:108-113` counts _lines_ to build its user-visible
   `Unknown item: {name} ×{count}` warning. Aggregating inside the parser would
   collapse three unresolvable lines into one and silently lose the `×3`. (The
   originally-assumed reason — that `fitToSkills` needs per-line items because
   a skill requirement is a max, not a sum — is **false**: `fitToSkills.ts:63`
   destructures `{ name }` and never reads `quantity` at all.)
2. The parser's own docstring scopes it to "Pure text-structure parse only"
   (`eftFit.ts:2-3`). Aggregation is semantics over the parsed structure.

Aggregation is therefore **one pass** in the importer, keyed by
`blueprintTypeID ?? name.toLowerCase()`, summing quantities. Keying by resolved
type subsumes name-keying (two spellings of one type merge a fortiori), so a
separate name-keyed pre-pass buys nothing but a second place for the merge rule
to be wrong. Unresolved items fall back to the name key so a skipped item
appearing on three lines still prints once.

A fit names the same module on one line per copy fitted; EFT's `xN` suffix is
used only for drone-bay/cargo lines. **Both forms occur in one fit and must
reach the same total.**

### Fixture — `[Buzzard, Loru's Max Hacker]`

```
[Buzzard, Loru's Max Hacker]
Inertial Stabilizers II
Inertial Stabilizers II
Micro Auxiliary Power Core I

5MN Cold-Gas Enduring Microwarpdrive
Data Analyzer II
Relic Analyzer II
Scan Rangefinding Array II
Cargo Scanner II

Sisters Core Probe Launcher
Interdiction Nullifier II
Covert Ops Cloaking Device II

Small Low Friction Nozzle Joints II
Small Low Friction Nozzle Joints II


Sisters Core Scanner Probe x16
```

Both regexes were hand-verified against this input: `HEADER`
(`eftFit.ts:41`) matches and the apostrophe survives; `QUANTITY_SUFFIX`
(`eftFit.ts:44`) yields `quantity = 16`. 14 body lines, no commas, so no charge
splits.

**12 distinct items + the hull = 13 rows.**

| Item                                 | Qty    | Source form   |
| ------------------------------------ | ------ | ------------- |
| Buzzard (hull)                       | 1      | header        |
| Inertial Stabilizers II              | **2**  | repeated line |
| Micro Auxiliary Power Core I         | 1      | single line   |
| 5MN Cold-Gas Enduring Microwarpdrive | 1      | single line   |
| Data Analyzer II                     | 1      | single line   |
| Relic Analyzer II                    | 1      | single line   |
| Scan Rangefinding Array II           | 1      | single line   |
| Cargo Scanner II                     | 1      | single line   |
| Sisters Core Probe Launcher          | 1      | single line   |
| Interdiction Nullifier II            | 1      | single line   |
| Covert Ops Cloaking Device II        | 1      | single line   |
| Small Low Friction Nozzle Joints II  | **2**  | repeated line |
| Sisters Core Scanner Probe           | **16** | `xN` suffix   |

Three rows have no blueprint and import as **skipped**, named:
`Sisters Core Probe Launcher`, `Sisters Core Scanner Probe` (faction) and
`5MN Cold-Gas Enduring Microwarpdrive` (named/meta). That is 3 of 14 lines —
a fifth of a routine paste, which is why skipped items are reported and never
dropped. (`Micro Auxiliary Power Core I` is meta-0 T1 and _does_ have a
blueprint; its absence from the skipped list is deliberate.)

### ME/TE must not default to 0

Ten of the 13 rows are T2 and require an invented BPC — and invention is out of
scope per `CONTEXT.md`'s Build Plan entry. `newBuildPlan` sets
`me: owned?.material_efficiency ?? 0` (`Industry.tsx:122-123`), so unless the
pilot owns each BPC, **every T2 member quotes at ME0/TE0** while a real
invented BPC is ME2/TE4. The Group Rollup would overstate material cost on ~77%
of its members, out of the box, on this very fixture.

Fit Import seeds each created plan's `me`/`te` from the existing
`sync.industryAssumedMe` preference. The mechanism exists
(`assumedMeForUnowned`, `recipes.ts:29-37`) but today reaches **only sub-jobs**
via `materialRecipe` — never a top-level plan's own `me`. An owned BPC still
wins, exactly as `materialEfficiencyFor` already decides for sub-jobs.

### Runs from quantity

`runs = ceil(quantity / blueprint.products[0].quantity)`, clamped to
`[1, 100_000]` to match `computeBuildPlan`'s own `clampInt`
(`computeBuildPlan.ts:50-66`) — otherwise a stored 2,000,000 _displays_ as
2,000,000 while every number on the page is computed at 100,000.

The resulting surplus is shown **per row in the preview, before Apply**, using
the existing word: `BuildRecipe.spare` already names this quantity
(`recipes.ts:140`, `unitsMade - needed`). No new vocabulary.

### Charges excluded by default

`parseEftFit` gives a loaded charge the **module line's** quantity
(`eftFit.ts:84`), so eight launchers yields 8 missiles — not a production
quantity under any reading. Charges are excluded by default with a checkbox to
include; when included a charge row defaults to `runs: 1` (one full blueprint
batch) with `spare` shown. Inventing a plausible batch size is worse than
declining: the pilot knows their ammo stockpile and the app does not.

### The header names the group

`fitName` when parsed. **There is no `else shipName` fallback** — `shipName` and
`fitName` are initialised to `''` together and assigned together inside the one
`if (headerMatch)` branch (`eftFit.ts:52-59`), and `HEADER` requires a comma and
a non-empty second group. So there are two outcomes, not three: header parsed
(both present), or header failed (both empty).

A failed header (`[Buzzard]`, `[Buzzard, ]`) therefore also means **no hull
plan**, since the hull is read from `fit.shipName`. That is surfaced as a
preview **error**, not a quiet degradation — the pilot is told the header could
not be read and that no ship was imported. Relaxing `HEADER` to accept a bare
`[Ship]` is a follow-up, deliberately not bundled here.

Group names need not be unique; the record is id-keyed, exactly as two Build
Plans may share a name today.

### Apply

One `db.buildPlans.bulkAdd` and **one** `scheduleSync` — not N of each. 25
individual adds would re-fire the `useLiveQuery` at `Industry.tsx:188-194`
25 times, re-rendering the whole route and re-running `materialPlanByTypeID`,
`comparePlans` and `effectiveSelectedId` on each.

The hull is written with the **highest `updatedAt`** in the batch.
`mostRecentlyUpdatedPlan` uses a strict `>` (`Industry.tsx:161-164`), so plans
sharing one `Date.now()` all tie and array order — effectively UUID order —
decides. Without this, the settings the pilot's _next_ hand-made plan inherits
(issue #456) come from a random member of the fit, possibly a rig.

Import selects the group it created, and expands it.

The dialog follows `ImportClipboardDialog`'s shape exactly: textarea → Parse →
preview with entries / warnings / errors → Apply, disabled when nothing is
importable. Unbuildable items are **warning rows naming the item**, shown in
the list rather than omitted from it.

## Group Rollup — `src/engine/industry/groupRollup.ts`

Pure, TDD, no fetch/DOM/Dexie. Takes each member's `BuildResult` plus its plan
metadata.

- **`totalCost`** — sum of member `totalCost`. This is the honest total.
- **No naive `jobFeeTotal`.** `BuildResult.totalCost` is documented as
  "materialCost + jobFee.total. **Sub-job fees are already inside
  materialCost**" (`engine/industry/types.ts:405-407`). Summing `jobFee.total`
  across members omits every sub-job fee. Either omit the figure or label it
  "top-level job fees only".
- **Two different material merges, never mixed into one number.**
  `materialTableRows` merges the resolved tree by typeID and deliberately keeps
  built materials as rows (`subBuildPlan.ts:109-123`); `shoppingListMaterials`
  drops built materials and returns only leaves (`subBuildPlan.ts:210-224`).
  The rollup merges `shoppingListMaterials` per member for the buy list and
  `materialTableRows` for the display table. Mixing them double-counts whenever
  one member buys a material another member's sub-build also consumes.
- **`seconds`** — sum, labelled total job time, not wall-clock; parallel job
  slots are not modelled.
- **`unpriceable`** — true if any member is; `unpricedMaterials` unions.
- **Forward estimate only.** `ProductionRunRecord`s carry no group id and
  outlive their plans by design (`db/index.ts:559-573`), so "what did this fit
  actually cost me" is unanswerable. The view must not imply otherwise.

### Owned stock: sum, never re-net — but flag over-claim

`remainingQuantity` nets against the plan's **stored**
`materialSourcing[typeID].ownedQuantity` (`types.ts:373-384`), not against live
detection; detection only ever _suggests_ a value to store (`ownedStock.ts:247-282`).
Neither has cross-plan awareness, so two unrelated Build Plans already
double-claim the same 100 Tritanium today — the group makes a pre-existing
defect systematic, it does not create it.

Re-netting in the rollup would produce a group total contradicting the sum of
the member views open right beside it. There is also no single pool to net
against even in principle: `ownedStockScope` is per-plan (`types.ts:369`), so
two members may legitimately scope to disjoint locations.

So the rollup **sums `remainingQuantity`** — this agrees with every member view
— and additionally emits `overClaimed: number[]`: typeIDs where the members'
summed `ownedQuantity` exceeds the unfiltered detected total from the one
shared `useOwnedStockSnapshot` (`Industry.tsx:210`). The view renders that as a
named warning. Never silently reconciled. The check is a pure function of
`(mergedMaterials, DetectedOwnedStockMap)`.

### Mixed hubs: report, never override

No `hubId` on the group — that would be a second writer for a fact the plan
owns. The rollup computes the distinct `hubId` set. Exactly one → offer the
multibuy copy, labelled with that hub. More than one → the copy control is
**disabled with a reason naming the hubs**, following the precedent already
written into `shoppingList.ts:49-51`: "a button that copies an empty string is
worse than one that is plainly unavailable." Same treatment for mixed build
system and mixed activity.

A freshly imported group is always single-hub, since every member is created
from one `defaultsFrom` (`Industry.tsx:79-158`).

## Group list rendering

Collapsed by default, except a group Fit Import just created.

- The store holds **expanded** ids, not collapsed ones:
  `Record<number /* characterId */, string[]>` via `createLocalSetting`
  (`src/lib/useLocalSetting.ts`), on the `lastOpenedPlan` model. Storing
  collapsed ids instead would make a group newly synced from another device
  arrive _expanded_, and would leave stale ids pinning deleted groups forever.
- Device-local, never synced — a viewing preference, not editable data.
- The expansion Fit Import performs is **persistent** (the setter writes to
  Dexie). A session-only alternative would need a second source of collapse
  truth; one boolean, one home.
- Hydration-gated, like `lastOpenedPlan` (`Industry.tsx:380-388`), or the list
  flashes between states on every visit.
- The collapsed row carries the **member count and the hull**, so it reads as a
  container and names the ship — the ship is otherwise invisible precisely
  because the group is collapsed.
- The group's **accessible label** includes the hull or member count. Row
  controls build their accessible name from the row name
  (`BuildPlanList.tsx:105,112,119`, with an in-file comment on why), so two
  groups named "PvE" would otherwise give a screen-reader user two identical
  "Delete PvE" buttons.
- Ungrouped plans keep rendering as a flat list. Groups are a layer over the
  list, not a replacement.

## Selection model — the largest unbudgeted piece

`Industry.tsx` has exactly two selection concepts: `selectedId` (a _plan_ id)
and `comparing`. A group view is a **third** kind and cannot be expressed by
either.

- `effectiveSelectedId` must not fall back to `plans[0]` while a group is
  selected (`Industry.tsx:376-389`) — that fallback also fires a market
  snapshot for a plan nobody asked for.
- `detailVisible` and `showBackControl` (`Industry.tsx:426-428`) must both
  include a group selection, or a phone stays on the list with the rollup
  rendered off-screen. The back control's `comparing ? … : …`
  (`Industry.tsx:643`) needs a third arm.
- **A group id must never be written into `lastOpenedPlan`**
  (`Industry.tsx:402-410`). It is read back and matched against
  `plans.some(...)`, so a group id stored there is dead weight forever.
- The `?product=` / `?material=` deep links do render-time `setSelectedId` on
  every render while the param is present (`Industry.tsx:317-319`, `362-364`).
  They must clear the group selection first — the discipline
  `openRunFromRecords` already applies by calling `exitCompare()` first
  (`Industry.tsx:557-561`).

## Interactions collapse breaks

- **Records → plan jump becomes a dead click.** `openRunFromRecords`
  (`Industry.tsx:557-561`) selects a plan whose row isn't rendered when its
  group is collapsed. It must expand the containing group.
- **Compare can't reach hidden members.** `compareSelectedIds` is a flat
  `Set<string>` of plan ids (`Industry.tsx:242`) and the checkbox renders only
  on a visible `PlanRow` (`BuildPlanList.tsx:61-69`). PR 1 gives the group
  header a select-all-members control; comparing two groups as units is a
  follow-up.

## Lifecycle

- **Deleting a group orphans, never cascades.** Members get `buildGroupId`
  cleared (one `bulkPut`, one `scheduleSync`) and reappear ungrouped. The repo
  made this exact call once and _reversed a cascade_ to get there —
  `markBuildPlanDeleted` "deliberately does not cascade to a Build Plan's own
  Production Runs (reversed after initially cascading)" (`planSync.ts:206-218`).
- **Deleting the last member leaves the group empty and visible.**
  Auto-deleting it would destroy the requirement the blob exists to satisfy.
- **A dangling `buildGroupId` renders ungrouped**, wording reused verbatim from
  `MiningTaxAssignmentRecord.groupId` (`db/index.ts:499-507`) rather than
  inventing a second phrasing for one rule.
- **`handleDuplicate` keeps group membership.** It spreads `...source`
  (`Industry.tsx:442-447`), so this happens by default — it is recorded here as
  a decision rather than left as an accident.

## Scope

**In this PR:** membership field + the pinned sync test; the
`sync.industryBuildGroups` setting + its allow-list test + the FAQ phrase;
`groupRollup.ts` (TDD); one-pass aggregation with the Buzzard fixture as its
pinned test; the Fit Import dialog; collapsible group rows and the three
interaction fixes above; the selection-model rework; a **"Move to group…"**
action on the existing per-row cluster (`BuildPlanList.tsx:102-123`), which
makes groups fully usable with no dragging; and Compare → icon.

**Deferred, one issue each:**

- **Drag-and-drop into groups.** The dnd precedent does **not** transfer.
  A repo-wide search finds zero uses of `useDroppable`, `DragOverlay`,
  `rectIntersection`, `pointerWithin` or `MeasuringStrategy`; both existing
  consumers (`EntryList.tsx:698-706`, `QuickbarList.tsx:115-118`) are one flat
  `SortableContext` with `closestCenter`. Dropping _into a container_ needs
  droppable headers, a hand-composed collision strategy (`closestCenter`
  compares centres, so a ~28px group header loses to adjacent ~40px rows),
  `DragOverlay`, `MeasuringStrategy.Always`, and `onDragOver` for cross-container
  preview. A collapsed group has zero child sortables, making the header the
  only target — dnd-kit's hardest case, not its easiest. Plus autoscroll tuning
  for the capped scroller, which `EntryList` had to discover once already
  (issue #408). `planDrop.ts` transfers as an _idea_ (pure, testable drop
  resolution) and in no other way.
- Group-aware Compare (comparing two groups as units).
- Group-level settings (pinned hub, shared facility).
- Mixed-hub multibuy reconciliation — PR 1 declines and names the hubs.
- Batched market snapshots per hub. `useComparedBuildResults` calls
  `loadMarketSnapshot` **once per plan** (`useComparedBuildResults.ts:87-92`),
  and `ESI_FANOUT_CONCURRENCY` bounds concurrency, not total requests — so a
  25-member group on one hub issues 25 snapshot fetches where one unioned fetch
  would do.
- Relaxing `HEADER` to accept a bare `[Ship]`.

## i18n

Every string through `src/i18n/locales/en.json`. ~15 keys: created/skipped
counts (plural-aware, `t(key, {count})` — follow `industry.compareHandle`),
per-item skip reasons, the spare-units note, the mixed-hub decline reason, the
over-claim warning, group empty state, delete-group confirmation, and the
toolbar controls.
