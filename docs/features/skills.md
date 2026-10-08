# Skills

Skills section. Four routed views under one nav entry (`src/app/navDestinations.ts:145`, group `progression`, `gating: 'scope'`, mobile tab). `/skills` redirects to `/skills/plans` (`src/app/App.tsx:158`). Sub-nav is real routes, not a Tabs widget: `src/features/skills/SkillsSubNav.tsx`. All four routes are `UNGATED` in `src/app/routeScopes.ts` (panel-level grant notes instead of a page gate). No Active Character -> redirect `/characters`.

| View         | Route                   | Component                                            | One-liner                                              |
| ------------ | ----------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Plans        | `/skills/plans`         | `src/routes/SkillPlans.tsx`                          | Skill Plan list + attributes pane + live in-game queue |
| Plan editor  | `/skills/plans/:planId` | `src/routes/SkillPlanEditor.tsx` -> `PlanEditor.tsx` | Edit, cost, optimize one Skill Plan                    |
| Trained      | `/skills/trained`       | `src/routes/Skills.tsx`                              | Trained skills by group, SP, attributes, implants      |
| Compare      | `/skills/compare`       | `src/routes/SkillCompare.tsx`                        | Side-by-side trained levels across Characters          |
| Certificates | `/skills/certificates`  | `src/routes/SkillCertificates.tsx`                   | CCP combat Certificates graded per Character           |
| Legacy       | `/skills/ships`         | `LegacyShipsRedirect`                                | Redirects to Ship Tree (see ships.md)                  |

Terms per `CONTEXT.md`: Skill Plan, Plan Milestone, Certified Plan, Optimize Modes, Remap, Booster, What-If Implants, Effective Skill Level, Clone State.

Data sources (all views)

- ESI via cache-aware loaders: `getCharacterSkills` (scope `esi-skills.read_skills.v1`), skill queue (`esi-skills.read_skillqueue.v1`), attributes (`esi-skills.read_skills.v1`, `src/esi/registry.ts:205-220`), implants (`esi-clones.read_implants.v1`), `/universe/types/{id}`, `POST /universe/names`.
- Queue-corrected trained levels: `loadCorrectedSkills` (`src/features/skills/correctedSkills.ts`) credits levels finished in the queue that `/skills` has not caught up to. Used by every view.
- SDE baked catalog: `loadSkillCatalog`, `loadCertificates` (`src/sde/loadSde`).
- Dexie: `db.skillPlans` (plans), `db.characters` (roster), settings table.
- Firestore sync (when `isSyncConfigured()`): plans via `src/sync/planSync.ts` (`scheduleSync(characterId)`; deletes write a tombstone via `markPlanDeleted`). Synced settings: `sync.skillCloneStates` (Alpha/Omega per Character, `cloneState.ts:18`), `sync.targetSkillPlan` (target plan per Character, `targetPlan.ts:10`). Saved comparisons are NOT synced (`comparisons.ts:5`). FAQ text: `settings.faq.store.synced.*`.
- Market hub sell orders for skill injectors / skill books (`src/market/prices`, Fuzzwork-era hub aggregate via `getHubPrices`).

---

## 1. Plans list (`/skills/plans`)

| Feature                                                   | Where                                                 |
| --------------------------------------------------------- | ----------------------------------------------------- |
| New plan (auto-opens editor, name in rename mode)         | `PlanListPane.tsx:138`                                |
| From a Certified Plan... (menu next to New plan)          | `PlanListPane.tsx:229-256`, `CertifiedPlanDialog.tsx` |
| Per-plan row: name link, duration + finish date stats     | `PlanList.tsx:60-135`                                 |
| Row menu: Rename, Duplicate, Copy to character..., Delete | `PlanList.tsx:141-181`                                |
| Attributes pane (desktop only)                            | `AttributesPane.tsx`                                  |
| Current skill queue panel                                 | `CurrentQueuePanel.tsx`                               |
| Implants-assumed note                                     | `PlanListPane.tsx:273`                                |

Page layout: header "Skills", `SkillsSubNav`, grid `lg:grid-cols-[20rem_1fr]` (list left, `AttributesPane` right; right column `hidden` below `lg`), then `CurrentQueuePanel` below when the catalog is loaded (`SkillPlans.tsx`).

- Plan list pane (`PlanListPane`): panel titled "Skill Plans". Height modes `sidebar` (max 40vh, used beside editor) and `viewport` (desktop: bounded to viewport via `useViewportBoundedHeight`; mobile uncapped so the tab bar does not hide rows, #1096).
- Per-row stats: "{duration} · finishes {date}" or "Nothing to train". Costed per plan with the plan's own lenses (what-if implants, boosters, Alpha) using `scheduleInputs` from `usePlanEditorData`. Row label has Tooltip with full name.
- Rename: inline `TextInput`; Enter commits, Escape reverts, blur commits; empty or unchanged name reverts.
- New plan: named "Untitled plan", seeded `remapCount` from live Remaps Available (`newPlan.ts`); navigates with `state.focusName` so the row enters rename mode.
- Duplicate: copy named "{name} (copy)"; carries entries, remapCount, markers, what-if implants, boosters, milestones (`PlanListPane.tsx:~170`). Navigates to the copy.
- Copy to character...: Modal with a character picker (other Characters only; item hidden when there are none). Stays on the current Character. Schedules sync for the target.
- Delete: confirm Modal ("This can't be undone"); tombstone delete so sync cannot resurrect.
- Empty: "No skill plans yet" / "Create a plan to start training toward a goal."
- Loading: Spinner. Mobile: list owns the single column; editor is a separate screen.

### Certified Plan dialog (`CertifiedPlanDialog.tsx`)

Modal "New certified plan". Intro text: CCP's own career plans. Career path picker (Explorer, Industrialist, Enforcer, Soldier of Fortune; fallback "Career {id}"), radio list of plans (faction name or "Any faction", skill-level count, milestone count), "All Certified Plans Complete" when the Character has finished all of a path. Create plan -> ordinary Skill Plan in CCP order, milestones as Plan Milestones, minus levels already trained (`certifiedPlan.ts`, `certifiedPlanRecord`). Loading spinner; load failure with Retry. Opens after the menu closes so focus restores to the trigger.

### Attributes pane (`AttributesPane.tsx`)

Character's current attribute sheet (base + implant + booster breakdown via `AttributeChips`), remap availability. Desktop-only beside the list; in the editor the same data lives in the tools pane.

### Current skill queue panel (`CurrentQueuePanel.tsx`)

In-game queue, not a plan. Times from ESI `finish_date` (never recomputed). Badges: Training, Done, Paused. "{duration} left" countdown ticks every 30s; ESI re-read every 5 min (`REFETCH_MS`, cache-aware). Notes: "N skills finished training. Log in to EVE to apply them."; "Training is paused, so EVE reports no completion times."; empty "No active in-game training queue cached."

---

## 2. Plan editor (`/skills/plans/:planId`)

Route (`SkillPlanEditor.tsx`): loads plan from Dexie (live query). Plan missing, deleted elsewhere, or belongs to another Character -> redirect `/skills/plans`. Header "Skills" with a portal slot where `PlanEditor` renders Import/Export. Below `lg` a "Back to plans" link button shows (list not on screen). Wide screens: two-column `PlanEditorLayout`; sidebar = plan list (top) + Plan tools pane (below). Narrow: tools pane is a collapsed Disclosure row ("Plan tools") above the entries. While the catalog loads the list stays in the sidebar with a spinner in the main column.

Persistence: every edit is `db.skillPlans.put({...plan, updatedAt})` then `scheduleSync` (`SkillPlanEditor.tsx` `handleUpdate`).

### 2a. Plan summary header (`PlanHeader.tsx`)

Stat chips: Training time, Skills (count), Projected finish, Trained ("{trained} / {total} SP", `—` until trained skills load), Next milestone (name Tooltip + finish date), Remap savings (duration or "None"; "?" tooltip when what-if implants shrank the saving; note when evaluated with fewer remaps than the plan allows), What-if chip ("What-if {lens}": saves / costs / same vs current). Plan name: editable in header on mobile only (`onRename` undefined on desktop - rename lives in the list row menu).
Orphaned Plan Milestones (entry removed) show as warning text with a remove IconButton.

### 2b. Entries panel ("Your entries")

- Live queue lead (`LiveQueueLead.tsx`): "Trains first in game: N skills, until {date}" when the plan is dated after the in-game queue; "Your in-game queue is paused, so this plan is dated from now."
- Skill picker (`SkillPicker.tsx`): search box (debounced 250 ms, ranked by name/group/description; ~500 skills), "Filter by skill group" select, results list; expanding a skill shows level buttons I-V, each flagged "Already trained" or "Already in plan" when covered, prerequisites and unlocks. Adding announces "Added {skill} {level}" (aria-live), shows "Jump to it". Empty: `No skills match "{query}"`.
- View controls beside the search: Group by (Priority | Attribute pair; device-local `planGroupingMode`), Columns menu (checkbox items: Attribute pair, Priority, Training time, Finish date; device-local `planColumnVisibility.v2`).
- Entry list (`EntryList.tsx`): one row per skill level in training order. Per row: drag handle, skill name + level, optional Attribute pair chip, Priority menu (High / Normal / Low; derived "effective" priority propagates from dependants to prerequisites, `src/engine/planPriority.ts`), Takes (per-level time), Done by (cumulative finish date), flags "Booster speeds this skill up" and "Above the Alpha skill cap", Plan Milestone marker/status (Next / Projected / Reached / Entry removed), row actions menu (`RowActionsMenu`): Add milestone... / Rename... / Remove milestone, separator, Remove {skill} (disabled with tap-reachable reason "Required by {blocker}" when it is a prerequisite of another entry). Remove opens confirm Modal "Remove skill".
- Prerequisite rows (derived, "Prereq" tag): can be dragged into the plan or promoted via "Add {name} to the plan" button (Prereq Promotion); announces "{name} is now a plan entry".
- Reorder: dnd-kit, pointer (4px activation) and keyboard (focus handle, Space to pick up, arrows to move, Space to drop, Escape to cancel; full screen-reader announcements `plans.dragAnnounce*`). Drops that would put a skill after a dependant are rejected with `plans.dropBlocked*` message (role=alert).
- Remap marker rows: inserted by "Add remap marker"; draggable, removable, click to open Remap marker attributes modal.
- Bands: grouping dividers "{Label} priority" or "{pair} attributes".
- In-progress skill pinned first when the plan matches the live queue (`pinnedInProgress`).
- Empty: "No entries yet. Add a skill to get started." Compute failure: "Couldn't compute this plan: {message}".
- Milestone modal (`MilestoneModal.tsx`): name input (placeholder `Goal name (e.g. "Fly Loki")`), Save / Cancel. Milestones anchor by (skillTypeID, level), not position (`src/engine/skillPlanMilestones.ts`).

### 2c. Plan tools pane (`PlanToolsPane.tsx`, sections built in `PlanEditor.tsx:1700-2040`)

Sections (labelled, one panel on desktop, Disclosure on mobile):

1. Actions
   - Remap budget line: "Remaps: {bonus} bonus now" + "yearly ready" / "yearly from {date}", or fallback "(from this plan's saved value - ESI attributes unavailable)".
   - Optimize dropdown (all modes preview in a Modal; nothing applies silently): Optimize for me (reorder + remap placement together), Reorder only, Shortest first (fast skills first honoring priority/prereqs), Place remaps only, Use my remap markers (disabled until a marker exists). Verdicts: "Remapping saves {duration}", no-gain/no-remaps/markers-at-end explanations, "Includes your yearly remap after {date}". Accept / Reject (Dismiss when no gain). Suggestion nudges: "Reorder suggested", "Shortest-first sort suggested".
   - Add remap marker button + "Marker added" confirmation. Optimize at my markers. Remap marker modal (`RemapMarkerModal.tsx`): set the attributes a remap should target, pre-implants; sum must total 99, each within 17-27 (copy from `plans.markerAttributesModalHint`); remaining/over-budget/out-of-range feedback; Save / Clear override / Cancel.
   - Remap optimizer supports at most 2 remaps (`MAX_SUPPORTED_REMAPS`, `src/engine/optimizer/placeRemaps.ts:110`); note "Evaluated with {count} remaps. This plan allows more; placement beyond that is not available yet."
2. Attributes
   - Current sheet note; "attributes impossible" warning when ESI total is not 99 (falls back to default spread).
   - Alpha clone checkbox (per Character, synced `sync.skillCloneStates`; Alpha = half speed + Alpha caps; count of capped levels).
   - What-if implants: Select (None / Current / Jump clone {label} / Custom), per-attribute implant bonus inputs, Market link to attribute enhancers. Per-plan, travels with Duplicate.
   - Booster list (`BoosterList.tsx`): ordered cerebral accelerators ("Accelerator N"), Bonus, Starts (or "Already running"), Expires, quick picks "+Nh"/"+Nd", Add/Remove, inline overlap rejection (EVE has one booster slot), "Expired" state, notice when ESI attributes already include an accelerator ("taken back out of your base sheet"), "does not report when an accelerator runs out" note. Market link to cerebral accelerators.
3. Skill injectors (`InjectorFactsPanel.tsx`): "If injected now:" SP still to train, Unallocated SP, SP gap, Large Skill Injectors needed, SP left over, Price per injector (sell min at the selected Trade Hub via `useMarketHub`), Total cost, "No sell orders at {hub}", "Unknown until your total SP loads", "already covered by unallocated SP", Alpha caveat.
4. Skills to buy (`SkillsToBuyPanel.tsx`): distinct untrained plan skills ("Unknown until your skills load" before ESI answers), each with its lowest sell at the selected hub (region fallback; "No sell orders at {hub}"), Total cost, unpriced count, Copy multibuy list.
5. Import / Export - not in pane; rendered in the page header (portal).

### 2d. Import / Export (page header)

- Import menu: From skill queue (ESI queue; if plan non-empty, Modal Append / Replace plan / Cancel; Replace shows toast with Undo; empty queue -> "Your in-game skill queue is empty"; error -> "Couldn't import the skill queue: {message}"); From text or file... (dialog).
- Import dialog (`ImportClipboardDialog.tsx`): tabs Paste | File. Paste: textarea, "Paste from clipboard" button (falls back to manual Ctrl+V when clipboard read is denied), Parse; auto-detects EFT fit ("Detected: EFT fit") vs plain skill plan, one "Skill Name Level" per line ("Detected: skill plan") (`clipboardImport.ts:53`). File: drop zone / Choose file for `.emp` (gzip) or `.xml` plan files ("Detected: plan file"), caps 2 MB compressed / 10 MB decompressed, DOCTYPE rejected, gzip via DecompressionStream (`planXmlDocument.ts`). Errors: too large, read failed, decompress failed, unsupported format, browser unsupported, malformed XML, multi-plan backup unsupported. Preview shows entries with "Already trained"/"Already in plan" flags, Warnings, Errors (`Line N: text - reason`), then Apply ("Added N skill(s)" / "0 added - all trained") or Cancel. EFT mode resolves modules and hull to required skills.
- Export menu: Export to clipboard ("Copied to clipboard"; EVE in-game format `<Skill> <Roman>` per line, `src/engine/clipboardExport.ts`); Export CSV (`skill-queue.csv`: Skill, Level, Seconds, Cumulative seconds, Prerequisite yes/no; `queueCsv.ts`; disabled when no scheduled steps).

---

## 3. Trained (`/skills/trained`, `Skills.tsx`)

| Control                   | Detail                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header actions            | Table actions menu (CSV / Excel / copy for Sheets, `TableActionsMenu`), Refresh                                                                         |
| Data-age badge            | older of `/skills` and queue fetchedAt                                                                                                                  |
| Stat chips                | Total SP (ESI total + SP of queue-completed levels), Unallocated SP                                                                                     |
| Attributes panel          | `AttributeChips`: five attributes, tooltip "{base} base + {implant} implant + {booster} booster = {effective}"                                          |
| Implants                  | `ImplantChip` per fitted implant (opens detail); "{n} of 5 slots empty" (attribute-slot implants only)                                                  |
| Search                    | sticky `SearchInput` "Search skills...", URL param `groupSearch`                                                                                        |
| Expand all / Collapse all | IconButtons, disabled while searching                                                                                                                   |
| Group sections            | SDE group, all collapsed on load, count, "Training -> {level} . {time}" chip on the group holding the live skill                                        |
| Skill row                 | name (tooltip = description), `SkillBar` (level pips, progress toward next level, planned-level mark from any plan of the Character), SP; click selects |
| Skill inspector           | `SkillInspector` panel above the list                                                                                                                   |

Behaviors:

- Search while active: groups with matches forced open, collapse toggles disabled, previous collapse state restored when cleared (`Skills.tsx:306-336`). Export narrows to matches; collapsed groups still export.
- CSV columns: Group, Skill, Level, Skill points (`skillsCsv.ts`); empty while skills scope needs re-auth.
- Inspector: description, Prerequisites, Unlocks (`skillRequirements.ts`), Close, "Add to Skill Plan" via `SkillPlanAdd` (adds the next level into the target plan; "Already at level 5" at max; "In plan" when covered; Undo; `TargetPlanPicker` "Adding to" select; creates a plan when none exists - "Create plan and add"). Selection scrolls into view, clears on Character switch.
- Unknown SP renders "Unknown" (queue credited a level without `level_end_sp`).
- States: Spinner; load failure "Couldn't load" EmptyState; skills scope missing/401/403 -> `GrantBanner` "Log in again to see skills" with re-auth action; no cache -> "No skill data cached / Couldn't load..."; stale cache -> "Showing cached data" label; no search match -> "No skills match your search."
- Scope: reads skills, skill queue (skipped without scope, `skipQueueWithoutScope`), attributes, implants; panel-level degrade, route ungated.

---

## 4. Compare (`/skills/compare`, `SkillCompare.tsx`)

- Header: Refresh (shown when >=1 selected; forces refetch, disabled while refreshing), Save comparison (primary; disabled with none selected), data-age badge (oldest selected).
- "Characters to compare": toggle chip per roster Character (avatar, name, per-character spinner while loading). Selection in URL `?ids=`; `comparisonId`, `differingOnly`, `groupColumn` also URL params. Unknown ids in a hand-edited URL are pruned once the roster loads.
- Table (`DataTable`, responsive="table", sticky Skill column, default sort Skill asc): columns Skill (SkillLink -> skill detail modal), Group (toggle, hidden on phones), one right-aligned column per Character (level 0-5, sortable; trailing Characters dimmed, leaders bold accent). Rows: union of skills any selected Character trained, missing = 0. Fetch: queue-corrected skills per Character, bounded concurrency (`ESI_FANOUT_CONCURRENCY`), a failing Character just contributes no rows.
- Filter chips: "Differing only" (only when >1 loaded; empty hint "No differing skills..."), "Group column".
- Export: `TableActionsMenu` (CSV / XLSX / clipboard), surface `skill-compare`, columns Skill/Group/per-Character (`skillCompareCsv.ts`), honors Differing only.
- Saved comparisons list: row = load button, Rename (inline), Delete (confirm Modal "can't be undone"). Save upserts the active comparison or creates "Untitled comparison". Loading resolves against the roster; removed Characters -> warning "Some characters in this comparison have been removed and are no longer shown." Stored in Dexie settings (`skillComparisons`), local only.
- States: none selected ("No characters selected"), loading Spinner, "No skill data cached", saved list empty ("No saved comparisons yet.").

---

## 5. Certificates (`/skills/certificates`, `SkillCertificates.tsx`)

CCP's baked combat certificates graded for the active Character, by area rather than hull (issue #2390). Model: `certificates/certificatesModel.ts`; data hook `useCertificatesData.ts`.

- Header: Refresh, data-age badge. Toolbar (`role=toolbar`): Group select (All groups + each group), Grade `CheckboxSelect` (grades Not started, Basic, Standard, Improved, Advanced, Elite, each with count; all selected by default), Target plan picker ("Adding to"), Sort select (Lowest grade [default], Name, Nearest grade = least training time first, Elite last).
- Sections per group with "{shown} of {total}". Row (`CertificateRow.tsx`): five grade pips, grade label ("Basic (1 of 5)" or "Not started"), expand toggle (aria-expanded) showing "{grade} needs N skill levels . {time}", per-skill missing list ("Missing for {grade}") with skill names, Alpha cap note "An Alpha clone can't reach {grade}: {skills} need Omega." Actions: "Add {grade} to plan" (adds unplanned levels to target plan), "In plan", "Complete" (Elite: "Elite: nothing left to train"), "Omega only" (Alpha Character, capped).
- Toast "Added N levels to {plan}" with Undo (`useTimedToast`).
- Times from the same scheduler the Plan editor and mastery tab use (`certificatesModel.certificateTimes`; all rows costed, since the time sort needs them). Alpha caps applied only when Clone State is alpha (synced).
- States: loading Spinner; "Couldn't load the certificates."; skills unreadable -> `GrantNote` + "No skill data cached"; "No certificates match these filters."
- Data: certificates SDE bake; skills via editor data hook (skills, attributes, implants).

---

## Ways to find and add skills (discovery paths)

Target of every "Add" is the Character's target Skill Plan (`TargetPlanPicker`, synced). None of these paths is guided for a returning player; Help/FAQ has no Skills text.

| Intent                      | Where                                                 | How                                                                                                           |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| I know the skill name       | Plan editor skill picker                              | Search (name, group, description; 250 ms debounce) or group filter; pick level I-V; shows prereqs and unlocks |
| Browse what I have          | Trained                                               | Expand a group, click a skill, inspector "Add to Skill Plan" (next level)                                     |
| Copy my in-game queue       | Plan editor Import                                    | From skill queue (Append or Replace, Undo)                                                                    |
| Bring a plan from elsewhere | Plan editor Import                                    | Paste text, or `.emp`/`.xml` file; EFT fit text resolves to its required skills                               |
| Follow CCP's career path    | Plans > From a Certified Plan                         | Explorer, Industrialist, Enforcer, Soldier of Fortune; minus trained levels                                   |
| Combat grades               | Certificates                                          | Per group; "Add {grade} to plan"                                                                              |
| Fly a hull                  | Ship Tree > Ship Info > Skills & Mastery              | Per skill or Add tier N (cumulative)                                                                          |
| Improve a fit               | Fittings: Missing skills chip, What to train panel    | Ranks next levels by effect on the fit, Tech II upgrades                                                      |
| Item or build gate          | Market item required skills, Industry skill-gate chip | Add to Skill Plan                                                                                             |
| Copy what an alt knows      | Compare                                               | "Differing only" shows skills one Character has and another lacks                                             |
| Cost the gap                | Plan tools > Skill injectors                          | SP gap, injectors needed, price at selected hub                                                               |

## Ordering tools (one plan, several goals)

| Tool                                                       | Effect                                                                                                      | Limit                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Drag handle (pointer or keyboard)                          | Exact manual order                                                                                          | Drop refused if a skill lands after a dependant or strands a sibling level                                                    |
| Priority High / Normal / Low per entry                     | Steers Reorder only; a prerequisite inherits the most urgent priority of its dependants (`planPriority.ts`) | Three levels; no "ship" tag. Mark every skill of ship A High, ship B Normal, to finish A first                                |
| Group by Priority                                          | Shows bands "{Label} priority"                                                                              | View only, device-local                                                                                                       |
| Optimize > Reorder only / Shortest first / Optimize for me | Reorders within priority; groups by attribute pair for speed (`reorderSuggestion.ts:100`)                   | Preview in a Modal, Accept or Reject. Priority only affects interleaving, so it is a soft preference, not a hard "A before B" |
| Plan Milestones ("Fly Loki")                               | Named goal at a (skill, level); shows its projected finish; "Next milestone" chip                           | Milestones do NOT steer the optimizer (no reference in `src/engine/optimizer`)                                                |
| Separate Skill Plan per ship                               | Each plan has its own time and finish; Duplicate or Copy to character                                       | One target plan receives adds; skills shared by two ships get counted in each plan separately                                 |
| Remap markers / Optimize at my markers                     | Place attribute remaps where they help the order                                                            | Optimizer supports at most 2 remaps                                                                                           |

No tool says "finish ship A fully, then B, using the best order inside each". Closest: priority High on A's skills, then Reorder.

## Buying skills (skill books)

Modern EVE has no separate skill book item: the skill's own typeID is the market item (`SkillPriceSection.tsx:1-14`). The plan editor's "Skills to buy" tools-pane section (`SkillsToBuyPanel.tsx`) lists the plan's untrained skills, priced at the selected Trade Hub (hub station, else its region), with a total and a multibuy copy.

| Need                         | Where                                                                                                 | Behavior                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price of one skill           | Skill detail modal (`SkillDetailModal.tsx:133`, opened from any `SkillLink`, e.g. Compare, Show info) | Lowest sell at the selected Trade Hub station, lowest sell in its region, fixed NPC price (row hidden if none), hub picker (shared synced hub), links into Market Browser (`/market/browser`, nearby = 10 jumps) |
| Why "No sell orders" is rare | `skillSellPrices.ts`                                                                                  | Priced from the hub region's ESI order book, not the hub-station aggregate, because NPC-seeded books sit in NPC stations across the region                                                                       |
| Cost of reaching the SP      | Plan tools > Skill injectors                                                                          | Large Skill Injectors needed and price at hub; covers SP gap, not which skills to buy                                                                                                                            |
| Buy several skills           | none                                                                                                  | Open each skill's modal, or search each in Market Browser                                                                                                                                                        |

Gaps: Trained inspector does not show price (modal does).

## Shared bits

- `SkillDetailModal` (`src/components/SkillDetailModal.tsx`): opened by `SkillLink` from Compare and elsewhere; strings `skills.detail.*` ("Skill not found", load failure).
- `TargetPlanPicker` / `AddToPlanBar` / `useTargetPlan`: shared add-to-plan target (also used by Ships, Fittings, Market required skills). Target per Character, synced.
- Skill price section / required-skills list (`SkillPriceSection.tsx`, `SkillRequirementsList.tsx`, `skillSellPrices.ts`): hub-station vs region lowest sell of the skill book (region fallback because NPC seeds often have none at the hub station).
- Help/FAQ: only the sync store line (`settings.faq.store.synced.skillPlans`, `...settingsDetail.skills`); no dedicated Skills help text found in `src/features/help` / `src/features/faq`. Keyboard shortcuts: none Skills-specific (`src/app/useKeyboardShortcuts.ts` has no skills binding); only drag-handle keyboard reorder.

## Engine formulas and thresholds (verified against `src/engine`)

All pure (no fetch/DOM/Dexie in `src/engine`, per CLAUDE.md).

- SP for a level: `ceil(250 * rank * 2^(2.5*(level-1)))` (`src/engine/sp.ts:24`). Rank 1: L1 250, L2 1,414, L3 8,000, L4 45,255, L5 256,000. Level must be integer 0..5 else RangeError; rank > 0.
- Part-trained level: `remainingSpForLevel(rank, level, currentSp)` clamps `currentSp` into the level's own band (`sp.ts:56`); later levels of the same skill are never discounted.
- Progress bar: `progressToNextLevel` returns null at level 5, else clamped 0..1 fraction (`sp.ts:72`).
- Training rate (SP/min): `primary + secondary/2`; Alpha x0.5 (`ALPHA_RATE_FACTOR`, `sp.ts:83-98`). Attribute <= 0 throws. Time = `sp / rate * 60` s. Halving the rate (not doubling the result) keeps Booster windows correct on Alpha (decision `20260922-191151-alpha-clone-state-is-a-per-character-setting.md`).
- Schedule (`src/engine/schedule.ts:62`): per step, SP consumed in piecewise-constant rate segments split at every Booster start/expiry still ahead (`EPSILON_SP = 1e-9`). Attributes per step = base + segment override (Remap Marker, from `steps[startIndex]` on) + implants + live Booster bonuses. Booster `startsAt` absent = already running. Boosters without `startDate` throws. `trainedSkills` credit is opt-in; two compared schedules must both pass or both omit it (`placeRemaps` omits; decision `20260902-205013-a-plans-times-match-the-in-game-queue.md`).
- Effective Skill Level = `min(trained, active)` (`src/engine/effectiveSkillLevel.ts`), both queue-corrected (decision `20260922-193557-effective-skill-level-one-min-trained-active-rule.md`). Skills views use queue-corrected trained.
- Queue correction (`src/features/skills/queueStatus.ts`): `classifySkillQueue` (:46) labels rows training / completed / paused / pending; paused queue = entries lack dates -> "ETA unknown", never "starts now"; NaN dates guarded. `applyCompletedQueueEntries` raises levels finished but not yet applied by ESI (SP only if `level_end_sp` present). `applyTrainingProgress` (:199) linearly interpolates SP inside the one level training (`training_start_sp` -> `level_end_sp` over the window), once per load (snapshot, not ticker); paused yields `training_start_sp` only (floor). `projectQueueEnd` (:297): plan waits only on queue ahead of the first level the plan also lists; unallocated SP never shortens the plan (decision `20260924-103647-skill-plan-waits-only-on-the-live-queue.md`).
- Remap legality: 99 base points over 5 attributes, each 17..27 (14 free points; `src/engine/optimizer/bestAttributes.ts:5,33-35`); implants/boosters add on top. Reported total != 99 is read as an inflated accelerator: bonus = `(total - 99)/5` (`src/engine/attributeBaseline.ts:25,42`); impossible sheets -> "attributes impossible" warning and default spread.
- Remaps Available (`remapAvailability.ts`): `bonus_remaps + (yearly ready ? 1 : 0)`; yearly ready when `accrued_remap_cooldown_date` absent or <= now. `remapBudget` (:84): live count when ESI attributes known (on cooldown -> `bonus+1` with `timedRemap` floor = seconds from plan start to cooldown end), else plan's stored `remapCount` fallback; evaluated count `min(count, 2)`.
- Optimizer cap `MAX_SUPPORTED_REMAPS = 2` (`placeRemaps.ts:110`): 2 remaps ~420 ms/press with a Booster live, ~6 ms without; 5 would be ~900 ms synchronous. `remapCount = 1` uses an O(R) suffix scan, never the DP. Tie bound `best + max(1e-6, best*1e-9)`. Timed (yearly) remap binds only the LAST allocation, lands at first run edge on/after cooldown; with 2+ bonus remaps at cap the yearly one is dropped (decisions `20260923-212119-yearly-remap-on-cooldown-is-placed-by-the.md`, `20260923-224805-remaps-available-drops-its-user-override-optimizer-always.md`). Booster cutoff is the LAST booster expiry, not the first.
- Reorder (`optimizer/reorderSuggestion.ts:100`): group by (primary, secondary) pair, groups ordered by first occurrence then stable-sorted by priority rank; repeatedly emit ready steps (all lower plan levels of own skill and plan-covered prereqs emitted; levels not in plan count as trained). Always terminates with a valid permutation; priority only affects interleaving. "Optimize for me" = `suggestReorder` then `placeRemaps` on that order (`optimizeForMe.ts`). "Use my remap markers" = `optimizeAtMarkers` (:48): best spread per marker-delimited segment.
- Priority propagation (`src/engine/planPriority.ts`): a prerequisite's effective priority = most urgent of itself and every transitive dependant; high > normal > low.
- Injectors (`src/engine/skillInjectors.ts:11`): Large Skill Injector yield by total SP at injection: < 5,000,000 -> 500,000; < 50,000,000 -> 400,000; < 80,000,000 -> 300,000; else 150,000. `injectorsToCover(gap, startTotal)` (:38) injects one at a time, each raising total SP (may drop bracket); gap <= 0 -> 0; surplus = delivered - gap. Priced at selected Trade Hub sell min; null = "No sell orders", never 0 ISK.
- Tier ladder (`src/engine/tierLadder.ts`): grade = highest tier fully trained, stopping at first unmet or EMPTY tier (a hull with no tier V skills tops at IV). Shared by ship Mastery and Certificates. Alpha-capped entry = target > skill `alphaMaxLevel` (0 = Alphas cannot train it).
- Certificates scope (decision `20260930-221643-certificates-tab-grades-the-combat-groups-only.md`): nine combat groups (Gunnery, Missiles, Drones, Shields, Armor, Targeting, Navigation, Engineering, Electronic Systems), 68 certificates; no hand-typed "lagging area" rule; baked from CCP's JSONL export; grade keys mapped by a fixed name list; level 0 = not needed.
- Plan data model (decision `20260906-235531-one-plan-row-per-skill-level.md`): one entry per skill LEVEL, `entryId = skillTypeID-targetLevel`; plans split once on open (`splitEntries.ts`, idempotent); Remap Markers are positions into the entry array and move with splits; add/promote is additive (never raises an existing row); a drop that strands ANY sibling row (a "ghost" level training nothing) is refused.
- Milestones (decision `20260923-220037-plan-milestones-anchor-to-a-skill-level-not.md`): anchor (skillTypeID, level); states derived, never stored: projected / reached (step gone because trained) / orphaned (step gone, never trained = entry removed).
- Alpha state: per Character, default Omega, synced; capped levels flagged not removed; manual only (live-queue auto-suggestion deferred).

## Persistence and sync matrix

| State                                                                                                       | Store                                                                                        | Syncs                                          |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Skill Plans (entries, remapCount fallback, markers, whatIfImplants, boosters, milestones, priorities, name) | Dexie `skillPlans`                                                                           | Firestore via `planSync` (tombstone on delete) |
| Alpha/Omega per Character                                                                                   | settings `sync.skillCloneStates`                                                             | yes                                            |
| Target plan per Character                                                                                   | settings `sync.targetSkillPlan`                                                              | yes                                            |
| Saved comparisons                                                                                           | settings `skillComparisons`                                                                  | no                                             |
| Plan columns, Group-by                                                                                      | settings `planColumnVisibility.v2`, `planGroupingMode`                                       | device-local                                   |
| Trained search                                                                                              | URL `groupSearch`                                                                            | no                                             |
| Compare selection                                                                                           | URL `ids`, `comparisonId`, `differingOnly`, `groupColumn`                                    | no                                             |
| Certificates filters/sort/expanded; Trained expanded groups, inspector selection                            | component state (all groups collapsed on load)                                               | no                                             |
| ESI skills/queue/attributes/implants                                                                        | HTTP cache (`loadWithCache`, honors `Expires`); Trained `useRouteSnapshot` cacheKey `skills` | no                                             |

Tab is a path segment, view state in URL (`docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`).

## State matrix

| Condition                    | Plans                                                               | Trained                                                       | Compare                                           | Certificates                           |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| Loading                      | spinner in list                                                     | spinner                                                       | per-char chip spinner; page spinner while no rows | spinner                                |
| Skills scope missing/401/403 | plans still work (ungated); costs assume untrained                  | `GrantBanner` "Log in again to see skills"                    | char contributes no rows; "No skill data cached"  | `GrantNote` + empty state              |
| No cached data / offline     | list works (Dexie)                                                  | "No skill data cached"; "Showing cached data" when from cache | "No skill data cached"                            | "No skill data cached"                 |
| Load error                   | `computeError` text in entries                                      | "Couldn't load" empty state                                   | char silently dropped                             | "Couldn't load the certificates."      |
| Attributes scope missing     | remap falls back to stored `remapCount`; implants-assumed-none note | attribute chips Unknown                                       | n/a                                               | times use default sheet                |
| Empty                        | "No skill plans yet"                                                | "No skills match" (search)                                    | "No characters selected"                          | "No certificates match these filters." |

Rate limiting: no Skills-specific UI; ESI fan-out bounded at 10 concurrent (`src/lib/concurrency.ts:11`); shared ESI client honors `X-Ratelimit-*`/`Retry-After` (CLAUDE.md).

Mobile vs desktop (`useIsDesktop`, lg): desktop = list + editor side by side, attributes pane right of list, tools pane open in sidebar, rename only in list row menu. Mobile = list and editor are separate routes ("Back to plans"), tools pane collapsed Disclosure, header name editable inline, Compare table scrolls horizontally with Skill column pinned and Group column hidden. Decisions: `20260902-052840-skill-plans-side-by-side-layout.md`, `20260926-123835-plan-rename-lives-in-the-list-row-menu.md`, `20260925-233737-plan-rows-have-no-move-up-down-control.md` (reorder is drag / Space+arrows only).

Tests assert (concrete behaviors):

- Trained (`src/routes/Skills.test.tsx`): groups start collapsed, expand/collapse per header and via Expand all; search hides non-matching groups, auto-expands matches, restores prior state on clear, persists in URL; export contains only the skills the search leaves; export is empty in the re-login state (stale cache cannot be exported behind the banner); 401 shows a re-login banner, not a silent offline state; queue scope never granted -> queue read skipped, no reauth notice; cached skills used when ESI unreachable; a level finished in the queue shows although `/skills` omits it; level credited but SP "Unknown" when ESI omits `level_end_sp`; only the in-progress skill gets the "Training -> level . time" chip, and the collapsed header of only its group; "N of 5 slots empty" counts only attribute-enhancer implants not hardwirings; accelerator shown as a third term beside base and implant; a transient implant type-lookup failure recovers instead of stalling on "#id"; skill already in any plan is marked on its level bar; Add to Skill Plan lives in the inspector (not the row), keeps Undo per skill; second click deselects; inspector scrolls into view (#1712).
- Compare (`SkillCompare.test.tsx`): side-by-side levels with gaps dimmed; selection and differing-only restored from URL; unknown id in hand-edited URL pruned (no ghost column); save, list, reload, rename, delete a comparison; Save again for the same selection updates rather than duplicates; saved comparison naming a removed Character degrades; load clicked before the roster loads still resolves (#594); differing-only hides all-equal rows; group column toggle; no-cache empty state offers Refresh and re-requests; table and header Refresh stay on screen during refresh; deselected Character drops without a loading frame.
- Certificates (`SkillCertificates.test.tsx`): graded lowest-first; grade filter options carry counts; expand lists what the next grade needs; Elite opens for description only; add next grade to plan with Undo; "Omega only" shown only for an Alpha Character whose cap blocks the grade; age badge from the skills read; Refresh keeps rows.
- Plans (`SkillPlans.test.tsx`): create/rename/duplicate/delete (Modal not `window.confirm`, cancel keeps) each schedule a sync; back link and browser Back return to list; one column on narrow screens, both panes on desktop; `/skills` redirects to plans; attributes come from ESI plus implant bonus, "unknown" when ESI fails; prerequisites inserted dimmed ahead of the entry; queue levels finished in the past count as trained; paused queue (no dates) is not credited and called paused; finished entry stays visible with "log in to apply"; queue import is deduped, export goes to clipboard, import parse failure shows inline error; optimize: savings verdict with per-segment instructions, "no remap helps" when already optimal, "0 remaps to spend" message, stale optimize result cleared when an entry is removed, markers persist as positions in Dexie, marker-at-end says it splits nothing, optimize-at-markers disabled with no markers, "evaluated fewer remaps than allowed" note; savings badge omitted at 0 remaps and while a Booster is active until optimized; yearly remap counted ready when cooldown past; reorder preview rewrites and persists order on Accept; what-if implants recompute time; Booster expired flag, active Booster changes schedule; both lenses persist across reload; import: pasted skill plan and EFT fit (required skills from ESI `dogma_attributes`), already-trained tagged and excluded from "Added N", "0 added - all trained"; projected finish matches the entry row finish, none for an empty plan.
- Engine tests sit beside each module in `src/engine` (`sp`, `schedule`, `optimizer/*`, `skillInjectors`, `tierLadder`) and `src/features/skills` (`queueStatus`, `skillStatus`); not individually enumerated here.

## Interview Q&A

1. How is training time computed; why does Alpha halve the rate instead of doubling the answer? `trainingRate` = primary + secondary/2 SP/min, x0.5 on Alpha (`src/engine/sp.ts:89`). The scheduler splits steps at Booster start/expiry; a Booster's wall-clock window covers half as much SP on Alpha, which doubling finished durations would get wrong (`schedule.ts:62`, decision `20260922-191151-...`).
2. Why can a plan be shorter than a naive sum? Part-trained level credit (`sp.ts:56`, `schedule.ts` `trainedSkills`), live-queue interpolation (`queueStatus.ts:199`), waiting only on queue ahead of the first shared level (`queueStatus.ts:297`).
3. Why is the remap optimizer limited to 2 remaps? Cost: ~420 ms/press at 2 with Booster, ~900 ms at 5, synchronous main thread; 1 remap is an O(R) scan (`placeRemaps.ts:101-110`). Surfaced as "Evaluated with N remaps..." (`plans.remapCapNote`).
4. Yearly remap on cooldown? Extra allocation with a not-before floor, binds only the last allocation, dropped if already 2 bonus remaps (`remapAvailability.ts:84`, decision `20260923-212119-...`).
5. How does Optimize for me work; is it safe? Reorder by attribute pair honoring priority and prereqs (`reorderSuggestion.ts:100`), then remaps on the new order (`optimizeForMe.ts`). Previewed in a Modal with Accept/Reject; priority never breaks prerequisite order.
6. Why one plan row per skill level? Matches ESI's queue shape, allows splitting levels; markers are positions so splitting translates them; stranding drops refused (decision `20260906-235531-...`).
7. How do Plan Milestones survive reorders? Anchored to (skillTypeID, level); state derived per render; orphans listed under the header (decision `20260923-220037-...`, `src/engine/skillPlanMilestones.ts`).
8. What do injector counts assume? Brackets 500k/400k/300k/150k at < 5M/50M/80M total SP, one at a time so a big gap can cross brackets; hub sell min price; unallocated SP never shortens schedule (`src/engine/skillInjectors.ts:11-51`).
9. How is a Certificate grade decided; why only combat groups? Highest fully trained tier, stop at first unmet/empty tier, same as ship Mastery (`src/engine/tierLadder.ts`); industry readiness is per-blueprint (decision `20260930-221643-...`).
10. Where do plans live; what does delete do? Dexie `skillPlans`, synced via `planSync`; delete writes a tombstone (`markPlanDeleted`) so remote cannot resurrect; saved comparisons not synced (`comparisons.ts:5`).
11. Behavior with skills scope missing? Routes ungated; plans edit and schedule without ESI; Trained shows re-auth banner; Certificates `GrantNote` (`src/app/routeScopes.ts:58-96`).
12. Why can a sheet fail the 99-point check? Accelerators inflate ESI attributes; app subtracts `(total-99)/5` as booster bonus; impossible totals fall back to default spread with a warning (`attributeBaseline.ts:25,42`).

## Observed gaps

- Trained view has no sort, no level filter, no "untrained/partial" view; only name search and group collapse.
- Trained and Compare export per-skill level only; no SP in Compare, no training-time columns.
- Plan list has no CSV/export of all plans; export/import is per plan only. Multi-plan `.xml` backups are rejected on import ("multi-plan backup").
- Remap optimizer capped at 2 remaps (`MAX_SUPPORTED_REMAPS = 2`); plans allowing more get the "not available yet" note.
- Saved comparisons are device-local (not in Firestore sync), unlike plans, target plan and clone state.
- Compare uses `ids` only; there is no way to compare against a Skill Plan or a Fitting's requirements here (that lives in Fittings/Ships).
- Header on Plans/Trained/Compare/Certificates is the same title "Skills" everywhere; the page `<h1>` does not name the active tab.
- No Skills-specific keyboard shortcuts or command-palette entries found (grep of `src/app/useKeyboardShortcuts.ts`, `src/features/commandPalette`).
- Row menu on Trained rows does not exist; add-to-plan is only via the inspector (`SkillPlanAdd` comment: "the Skills list rows have no menu of their own").

## Improvement ideas

- Trained: sortable columns (SP, level), filter for partially trained / level < 5, per-row add-to-plan action.
- Compare: SP and "missing vs a Skill Plan / Fitting requirements" columns; sync saved comparisons like plans.
- Plans: export/import all plans (multi-plan backup currently rejected); bulk delete.
- Optimizer: raise `MAX_SUPPORTED_REMAPS` by moving `placeRemaps` into a Web Worker (cost is the stated blocker, `placeRemaps.ts:101-110`).
- Suggest Alpha from live queue rate (deferred in decision `20260922-191151-...`).
- Per-tab page titles/h1 (all four views read "Skills").
- Surface rate-limit / retry state for the multi-character Compare fan-out instead of silently dropping a failed Character.
