# Brief: SDE pipeline + skills data layer (Items 03, 04)

## Payload budget — measured numbers (not estimates, except where noted)

Current `public/data/` (raw / gzip, `gzip -c file | wc -c`):

| file            | raw bytes | gzip bytes |
| --------------- | --------- | ---------- |
| blueprints.json | 1,457,382 | 128,725    |
| skills.json     | 108,403   | 9,947      |
| types.json      | 728,903   | 88,709     |
| **total**       | 2,294,688 | 227,381    |

`types.json` today holds only **9,193** entries — every typeID _referenced by a
skill prereq or a manufacturing blueprint_, not the full published catalog
(`scripts/build-sde.mjs:298-318`). There are **26,981 published types** total
(measured from a full `invTypes.csv` download). This matters for both items
below and for `features/market/search.ts` (see Risks).

Numbers below are derived from actual downloads of the current-latest
Fuzzwork `invTypes.csv` (19.5MB, has a `description` column CCP ships per
type) and `dgmTypeAttributes.csv` (16.4MB), filtered exactly the way
`build-sde.mjs` would filter them. Not guesses.

**(a) Skill descriptions** (511 published skill-category types, matches
`skills.json` count exactly):

- Raw description text: 75,294 bytes (avg 147 B/skill, max 1,332 B).
- As JSON-encoded `"description":"..."` fields added to skills.json: **+84,401 bytes raw**, gzip delta ≈ **+15 KB** (measured gzip of the concatenated description blob: 14,867 B at ratio 0.197, in line with the rest of skills.json's ~9% gzip ratio).
- **skills.json total after: ~193 KB raw / ~25 KB gzip.** Small, always-loaded cost is fine.

**(b) Skill→skill reverse index ("unlocks")**:

- **Zero new bytes.** Every skill's `prereqs: SkillPrereq[]` (`src/sde/types.ts:12-21`) is already shipped in skills.json. "Which skills need skill X" is a pure in-memory inversion of data already downloaded — `for (const s of skills) for (const p of s.prereqs) index[p.skillTypeID].push(s)`. No SDE build change, no payload growth, no new file.
- This directly contradicts the teardown claim that this needs "a reverse index in the SDE build."

**(c) Skill→items index ("which items enable/require this skill")** — measured by parsing the real CSVs the way build-sde.mjs would, but _without_ the `skillTypeIds.has(typeID)` filter at `scripts/build-sde.mjs:194` (today's build only keeps dogma attribute rows for the 511 skill types themselves — it throws away every ship/module/charge's requiredSkill rows):

- 645,769 `dgmTypeAttributes.csv` rows scanned; 6,958 published types (of 26,981) carry ≥1 requiredSkill attribute; 9,527 total (item, requiredSkill, level) pairs; 401 distinct skills are referenced as a requirement by something.
- Reverse index itself (`{ skillTypeID: [{typeID, level}, ...] }`): **+297,634 bytes raw / +28,577 bytes gzip** as a standalone JSON blob.
- Of the 6,958 items needing a skill, **3,874 are NOT already in types.json's 9,193-entry referenced set** — they'd need new name/group entries. At today's ~79 B/entry average: **+~307,165 bytes raw**, gzip-scaled (types.json's ~12.2% ratio) **≈ +37.5 KB gzip**.
- **Combined (c) delta: ~605 KB raw / ~66 KB gzip** on top of today's 2.29 MB raw / 227 KB gzip total — roughly a **29% gzip increase** for a feature only a subset of users will open.

**Recommendation:** ship (a)+(b) inline in skills.json — trivial, always-useful, no reason to lazy-load. Do **not** inline (c). Emit it as a new, separate lazily-fetched file, e.g. `public/data/skillItemReqs.json` (index) — new item _names_ can either go in a second lazy file (`skillItemNames.json`, the 3,874 delta only) or be folded into `types.json` if item 07/14 end up needing the full published catalog anyway (see Downstream). Fetch both only when the skill inspector panel actually opens (`loadSkillItemReqs()`, same `cached()` pattern as `src/sde/loadSde.ts:9-18`), never from the Skills/SkillPlans route's initial load. Tradeoff: one more network round-trip the first time a user opens the inspector (acceptable — GH Pages CDN, small file, one-time per session) vs. permanently taxing every Skills-page load (skills.json is fetched on every visit to `/skills` and `/skills/plans`) with a payload most sessions never touch.

**SDE cache / rebuild cost:** `.cache/sde` is gitignored (`.gitignore:2`, `scripts/build-sde.mjs:19`) and persists between `npm run sde:build` runs — `download()` (`scripts/build-sde.mjs:56-85`) skips re-fetching any cached file with `size > 0`. Both items 03(c) and 04 read fields (`description`, and _all_ published types' `dgmTypeAttributes` rows rather than just skill types') that are already present in the two CSVs the pipeline already downloads (`invTypes.csv`, `dgmTypeAttributes.csv`) — **no new file needs downloading**, so a clean `sde:build` run doesn't get slower on the network side. The in-process parse of `dgmTypeAttributes.csv` for item (c) does go from filtering 511 typeIDs to scanning against 26,981 — still a single linear pass over the same 645,769 rows already read into memory (`raw['dgmTypeAttributes.csv']`), so CPU cost is negligible (sub-second in Node for this row count). Net: rebuild time is unaffected in any user-visible way. A **stale local `.cache/sde`** from before this change still has the right columns (nothing new to download), so no forced cache-bust is needed — but bump a comment in the script noting the widened attribute filter so a dev doesn't assume `.cache` needs clearing.

---

## Item 03 — Skill inspector: prerequisites and unlocks

**Artifact claim:** "Data is parsed already. `features/skills/dogma.ts` resolves required-skill pairs. Needs a reverse index in the SDE build plus a panel."

**Verdict:** PARTIALLY TRUE — split verdict, the two halves of "unlocks" have wildly different costs (`src/features/skills/dogma.ts:81-96`, `scripts/build-sde.mjs:182-230`).

- **Prerequisites** (what a skill needs): CONFIRMED already resolved, but the claim's citation is imprecise. `dogma.ts:extractRequiredSkills` (`dogma.ts:81-96`) parses **ESI runtime `dogma_attributes`** for a fitted item (ship/module) at view-time — it does not touch skill-of-skill prerequisites at all. The actual skill→skill prereq data used by the planner already lives in `skills.json`'s `prereqs` field, built at `scripts/build-sde.mjs:211-219` from the _same_ `REQUIRED_SKILL_ATTRIBUTE_PAIRS`/`PREREQ_PAIRS` pairing, and is already fully expanded transitively at runtime by `src/engine/plan.ts:22-36` (`normalizePlan`'s recursive `add`). So "prerequisites" for the inspector panel needs **no new data at all** — just a UI read of `skill.prereqs` plus a walk of `engine/plan.ts`-style recursion (or a thin duplicate) for the transitive chain.
- **Unlocks (skill→skill)**: FALSE that it needs an SDE-build reverse index — CONFIRMED it needs _a_ reverse index, but it's a zero-cost runtime inversion of `skills.json.prereqs`, not a build-time addition. See payload budget (b) above.
- **"Which items it enables" (skill→item)**: CONFIRMED this needs new SDE-build work, and it is **not free** — see payload budget (c). This is the expensive half of the item, and it's the one the teardown undercounted by lumping it in with "a reverse index" as if both were symmetric-cost.

**Verified baseline:**

- `src/sde/types.ts:12-21` — `SkillType.prereqs: SkillPrereq[]` already shipped.
- `scripts/build-sde.mjs:205-230` — builds `prereqs` per skill from `REQUIRED_SKILL_ATTRIBUTE_PAIRS`/`PREREQ_PAIRS`, verified-correct pairing per the header comment.
- `src/features/skills/dogma.ts:1-18,81-96` — the _verified_ (not backwards) pairing, with the correctness note the task brief asked me to check: **the pairing in both `dogma.ts:32-39` and `build-sde.mjs:38-45` already matches** (1289↔1287, 1290↔1288) — both files carry the same verified table and the same warning comment. This is good: whichever file the new reverse-index code touches, it inherits the already-correct pairing rather than re-deriving it. **Correctness risk to flag anyway:** if a future SDE-build reverse-index or item-index function reimplements `PREREQ_PAIRS` a third time (rather than importing/sharing the existing constant), that's a third place this exact table can silently drift out of sync. Recommend the new item-index code in `build-sde.mjs` reuse the _same_ `PREREQ_PAIRS` array already defined at `scripts/build-sde.mjs:38-45`, not a fresh copy.
- `src/engine/plan.ts:22-36` — transitive prereq expansion already exists (pure, engine-side, tested presumably via `plan.test.ts`).
- No skill→skill reverse index exists anywhere (`grep` for "unlocks"/reverse turned up nothing).
- No skill→item index exists anywhere. `src/engine/import/fitToSkills.ts:9` explicitly notes `SkillType.prereqs` "only covers skill-of-skill dependencies, not [an item's requirements]" — confirming this relation has never been built, only computed ad hoc per-item at ESI-fetch time via `dogma.extractRequiredSkills`.
- No inspector panel component exists under `src/features/skills/planner/`.

**Gap:**

1. A `buildUnlocksIndex(skills)` pure function (skill→skill), computed client-side — trivial, no SDE change.
2. A build-time skill→item index in `scripts/build-sde.mjs`, emitted as its own lazy-loaded JSON (see payload budget), plus the ~3,874 missing item names.
3. An inspector panel UI: select a plan row → show prereqs (with transitive chain), unlocks, items-enabled (lazy-loaded), jump-to-position.
4. "Jump-to-position": scroll/highlight the target row in the current Skill Plan's `EntryList`, or if the skill isn't in the plan, offer "add via SkillPicker" — this is new UI wiring in `planner/`, not a data gap.

**Engine vs UI split:**

- `src/engine`: nothing new required. Transitive-prereq walk can reuse/extract a `plan.ts`-adjacent helper (e.g. a non-mutating `expandPrereqs(skill, skills): PlanStep[]` sibling of `normalizePlan`) if the panel wants a flat ordered chain rather than a tree; keep it pure/TDD if added, since it touches `src/engine`.
- `src/features/skills`: `buildUnlocksIndex(skills: SkillType[])` (pure, but not "calculation" math — doesn't strictly require CLAUDE.md's TDD engine rule, though tests should exist), the item-index loader, and the panel's data assembly (which skill, which plan, current character's trained levels for context).
- `src/features/skills/planner`: the panel component itself, jump-to-position wiring into `EntryList`.

**Files touched:**

- `scripts/build-sde.mjs` — remove/relax the `skillTypeIds.has(typeID)` filter at line 194 for a second pass (or a parallel accumulator) that also collects requiredSkill attrs for **all** published types; reuse `PREREQ_PAIRS` (don't redefine); emit new output file(s).
- `src/sde/types.ts` — add types for the new index shape(s) and a `SkillItemReq`/`SkillItemIndex` type.
- `src/sde/loadSde.ts` — add `loadSkillItemReqs()` following the existing `cached()` pattern (`loadSde.ts:9-18`), pointed at the new lazy file — **do not** add it to the eager load path used by Skills/SkillPlans routes today.
- `src/features/skills/skillMap.ts` — good home for `buildUnlocksIndex` (it already adapts SDE shapes to engine-consumable shapes for this feature).

**New modules:**

- `src/features/skills/unlocks.ts` (or added to `skillMap.ts`) — pure skill→skill reverse index builder + memoization note (per-catalog-load, not per-render).
- `src/features/skills/itemRequirements.ts` — loads/exposes the lazy skill→item index, adapts to a UI-friendly shape (typeID, name, level) by joining against `types.json` + the new name delta file.
- `src/features/skills/planner/SkillInspectorPanel.tsx` — the new UI panel (prereqs / unlocks / items-enabled tabs or sections, jump-to-position button).

**Shared primitives needed:**

- `Tabs` (exists, `components/ui/Tabs.tsx`) — good fit for prereqs/unlocks/items-enabled as three sub-views inside the panel.
- `DataTable` (listed `○` planned, not yet built per `docs/DESIGN.md:97`) — if the items-enabled list is more than a handful of rows, this item and Market Browser (`features/market`) both want the same dense sortable table; flag for orchestrator to assign single ownership rather than building a one-off list here.
- No new design token needed; `Panel` + `panel-2` nesting per existing convention.

**Design tokens/components used:** `Panel` (the inspector is a panel, don't nest another Panel inside — use `panel-2` fill per DESIGN.md convention), `Tabs` for the three sub-sections, `Button` for jump-to-position (one primary action per view — this panel already lives inside the Skill Plan view, so treat jump-to-position as the panel's one primary button, not a second competing CTA against the plan editor's own primary action). Uppercase micro-heading for the panel title. `Spinner` while the lazy item-index fetch is in flight (first open only — cached after).

**Tests:**

- `src/features/skills/unlocks.test.ts` — asserts reverse-index correctness against a small fixture (skill A requires B at level 3 → unlocks(B) includes {A, level:3}); asserts a skill with no dependents returns empty; asserts it doesn't choke on the real pairing verified in `dogma.ts` header (regression guard: build a fixture using 1289/1287 and 1290/1288 attribute IDs explicitly so a future "fix" that flips them back to the "commonly assumed" wrong order fails the test).
- `src/features/skills/itemRequirements.test.ts` — asserts the loader shape, joins correctly against a types fixture, handles a typeID missing from the name delta gracefully (shouldn't throw — matches the codebase's "never throws" pattern seen in `computeBuildPlan`).
- `scripts/build-sde.test.mjs` (if such a harness exists — check; if not, this is a good candidate to add) or a sanity-check addition to the existing `main()` sanity-check block (`build-sde.mjs:335-352`): count of item-index entries, count of skills with zero items requiring them (expected — many skills like Advanced Planetology enable content, not gear).
- E2E: `e2e/support/mockEsi.ts` doesn't need changes (SDE data is static JSON served from `public/data/`, not ESI) — but if e2e serves `public/data/*.json` from the 5199 dev server, add the new lazy file(s) to whatever fixture/build step e2e relies on so the panel isn't silently broken in CI. Verify this before shipping.

**i18n keys:** `skills.inspector.title`, `skills.inspector.prerequisitesTab`, `skills.inspector.unlocksTab`, `skills.inspector.itemsTab`, `skills.inspector.jumpToPosition`, `skills.inspector.noUnlocks`, `skills.inspector.noItems`, `skills.inspector.loadingItems`.

**Sync / Dexie impact:** None. The inspector is a read-only derived view over already-loaded SDE data + the current in-memory Skill Plan selection. No new Editable Data field, no `sync.`-prefixed setting, no Dexie schema bump.

**New ESI scopes:** none. Everything here is SDE (build-time) + already-cached character skill data.

**Cost:** Revise from S to **S for prereqs+unlocks, separately M for the items-enabled half** if both ship together — the teardown's single "S" undercounts the item-index engineering (new build-sde.mjs pass, new lazy-fetch plumbing, new join logic against a name delta, new tests) plus the payload/lazy-load decision work. **Recommend shipping prereqs+unlocks alone as the S-cost item first** (near-zero payload, no new files, panel UI only), and treating skill→item as a follow-up scoped separately — this also directly answers the brief's "may let a cheaper version ship first" question: yes, decisively.

**Depends on:** none blocking. Independent of items 07/14 but should land its lazy-index shape with those in mind (see Downstream below).

**Risks / open questions:**

- Orchestrator must decide: ship item-index at all in this milestone, or defer to when item 14 (Doctrine Designer) needs full item/skill cross-referencing anyway — building it once for both saves rework.
- If item-index ships, decide file layout: fold the 3,874 missing names into `types.json` (grows the _already-eagerly-loaded_ Market Browser file by ~42% raw) vs. a separate lazy name file (more files, more round-trips, but zero cost to Market Browser/existing consumers). I recommend separate — Market Browser's `search.ts` currently only searches the 9,193 _referenced_ types anyway (see Risks in Item 04 below), so growing `types.json` doesn't even fix that gap; keep concerns separated.
- `build-sde.mjs`'s sanity-check block (`:335-352`) should gain a check for the new index too (e.g., no item-index entry pointing at a skillTypeID absent from `skills.json`), matching the existing "prereqs pointing outside skills.json" pattern.

---

## Item 04 — Search skill descriptions, and filter the list

**Artifact claim:** "Missing. Search is name-only. Add the description field in `scripts/build-sde.mjs`, then filter chips in the picker."

**Verdict:** CONFIRMED search is name(+group)-only today; CONFIRMED description field is missing from the build (`src/features/skills/planner/SkillPicker.tsx:26`, `scripts/build-sde.mjs:220-230`).

**Verified baseline:**

- `SkillPicker.tsx:22-28` — `results` filters `s.name.toLowerCase().includes(q) || s.groupName.toLowerCase().includes(q)`, capped `MAX_RESULTS = 20` (`SkillPicker.tsx:8`), **no relevance ranking** — results stay in whatever order `skills` (the prop) arrives in, unlike Market Browser's search.
- `src/features/market/search.ts:30-48` (`searchTypes`) — case-insensitive substring match over `TypeMap` (name only; `TypeInfo` has no description field, `src/sde/types.ts:46-51`), ranked exact(0) > prefix(1) > substring(2), then alphabetical, capped `SEARCH_RESULT_LIMIT = 50` (`search.ts:16`).
- `scripts/build-sde.mjs:220-230` — skill objects built with `typeID/name/groupID/groupName/rank/primaryAttr/secondaryAttr/prereqs`; no `description` field read from `invTypes.csv`'s `description` column (confirmed present in the real CSV — see payload budget).
- No filter-chip UI primitive exists yet (`ls src/components/ui/` — no `Chip`/toggle component; `StatChip` is a display-only chip, not an interactive filter toggle. No `aria-pressed` usage found anywhere in `src/`).

**Gap:**

1. `skills.json` needs a `description: string` field (cheap — see payload budget (a)).
2. `SkillPicker`'s filter needs to also match description text, and needs relevance ranking (it currently has none — a real, separate bug from "missing description search").
3. Filter chips: trained / untrained / has-prerequisites / hide-maxed — no chip component exists; needs both a UI primitive and the filter predicates.
4. `searchTypes` (Market Browser) and `SkillPicker`'s picker are two independent, differently-behaved implementations of "substring search over an SDE-derived list" — worth consolidating.

**Should they share one ranked-search helper?** Yes, extract one. Evidence: `searchTypes`'s ranking logic (`relevanceRank`: exact/prefix/substring, `search.ts:18-22`) is exactly what `SkillPicker` is silently missing today — it's not a stylistic choice, `SkillPicker` has a real relevance-ordering gap that copying `searchTypes`'s pattern fixes for free. The two differ only in: (a) what fields they match against (name only vs. name+group+description), (b) the result cap (50 vs 20), (c) input shape (`TypeMap` record vs `SkillType[]` array). A generic `rankedSearch<T>(items: T[], query: string, getFields: (item: T) => string[], limit: number): T[]` closes both gaps at once and gives Market Browser item-description search "for free" later if item descriptions are ever added to `types.json`. This is exactly a "shared primitive," not a private one-off — flag for orchestrator ownership, candidate home `src/lib/search.ts` (fits the existing `src/lib` charter: "small pure formatters shared across features with no other natural home," `docs/ARCHITECTURE.md` module table) or a new `src/search/` if it grows beyond one function.

**Engine vs UI split:**

- Not `src/engine` — this is search/filter, not training-time calculation math, and CLAUDE.md's TDD-required list is `src/engine`, `src/auth`, industry math specifically. It's still pure and colocated-testable; put it in `src/lib/search.ts` (or `src/search/rankedSearch.ts`).
- Filter predicates (trained/untrained/has-prerequisites/hide-maxed) are pure functions over `(SkillType, TrainedSkill|undefined)` → boolean; colocate in `src/features/skills/` (e.g. `skillFilters.ts`), not engine — they're UI-facing display filters, not part of the training-schedule calculation the engine owns.
- UI: `SkillPicker.tsx` wiring the new search + chip state; the new chip component in `components/ui` if promoted to a design-system primitive (recommended, since item 03's inspector and any future filterable list will want the same interactive-chip pattern).

**Files touched:**

- `scripts/build-sde.mjs:220-230` — add `description: t.description` (or via a new `descriptions` lookup keyed off `invTypes.csv`'s `description` column) to the skill object.
- `src/sde/types.ts:14-21` — add `description: string` to `SkillType`.
- `src/features/skills/planner/SkillPicker.tsx` — replace the inline filter with the shared ranked-search helper (matching name+groupName+description), add chip row + filter state, wire trained-skill lookups (needs a `Map<number, TrainedSkill>` prop it doesn't currently take — check caller).
- `src/features/market/search.ts` — refactor `searchTypes` to call the new shared helper instead of reimplementing ranking (keep its own file for the `TypeSearchResult`/volume-specific shape and `SEARCH_RESULT_LIMIT`).

**New modules:**

- `src/lib/search.ts` — `rankedSearch<T>()`, colocated `search.test.ts`.
- `src/features/skills/skillFilters.ts` — `isTrained`, `isUntrained`, `hasPrerequisites`, `isMaxed` predicates + a combinator the picker calls.
- `src/components/ui/FilterChip.tsx` (recommend promoting to design-system primitive rather than a one-off in `planner/`) — interactive toggle chip, `aria-pressed`, tone variants matching `StatChip`'s existing tone system for visual consistency.

**Shared primitives needed:** the `rankedSearch` helper (named above, needed by both this item and existing Market Browser code — do not let this item build a private copy); a `FilterChip`/toggle-chip primitive (doesn't exist anywhere in `components/ui` today — name it for the orchestrator rather than inventing it silently in `planner/`).

**Design tokens/components used:** new `FilterChip` should reuse `panel-2` fill (chips use `panel-2` per `docs/DESIGN.md:19`), `rounded-xs`, 11px chip type scale (`docs/DESIGN.md:71`), uppercase micro-heading style is NOT needed here (chip labels are short words, not headings) — but keep them visually consistent with `StatChip`'s tone palette (default/accent/success/warning/danger) so an active "trained" chip and a `StatChip` elsewhere in the same view read as the same chip language. `SkillPicker`'s existing input styling (`border-line`, `bg-panel-2`, `focus-visible:outline-accent`, `SkillPicker.tsx:47`) stays unchanged.

**Tests:**

- `src/lib/search.test.ts` — TDD-style: exact > prefix > substring ranking, alphabetical tiebreak, cap enforcement, empty-query returns empty (matches both existing modules' "no dump-all-types" behavior), multi-field matching (name miss but description hit still matches).
- `src/features/skills/skillFilters.test.ts` — each predicate against fixtures: trained at level ≥1, untrained (no entry in trained map), has-prerequisites (prereqs.length > 0), hide-maxed (trained at level 5 excluded).
- `SkillPicker.test.tsx` (if one exists — check; component currently has no colocated test file found) — description-text match surfaces a skill whose name doesn't contain the query (the literal "powergrid" → "Power Grid Management" case from the spec), chip combination narrows results correctly.
- `src/features/market/search.test.ts` (check if exists) — regression test that the refactor to use the shared helper doesn't change `searchTypes`'s existing ranked/capped behavior.

**i18n keys:** `plans.filters.trained`, `plans.filters.untrained`, `plans.filters.hasPrerequisites`, `plans.filters.hideMaxed` (chip labels); no new copy needed for search itself (`plans.searchPlaceholder` already exists, `en.json:76`).

**Sync / Dexie impact:** None. Filter-chip state is ephemeral UI state (not persisted per CONTEXT.md's Editable Data definition), search query is transient. No Dexie schema bump, no `sync.`-prefixed setting, no push/pull mapping change.

**New ESI scopes:** none.

**Cost:** Confirm **S** — description field is a one-line CSV-column read already-downloaded, chips are a new small component + pure predicates, ranked-search extraction is a small refactor of existing logic. The only judgment call inflating this slightly is whether `FilterChip` becomes a proper reusable design-system primitive (recommended) vs. a one-off in `planner/` (faster but creates the debt item 07/14 would hit again). Either way stays S.

**Depends on:** none. Can ship independently of Item 03 and before/after it in any order.

**Risks / open questions:**

- `SkillPicker` doesn't currently receive a `trainedSkills` map as a prop (`SkillPicker.tsx:11-14` — props are `skills, onAdd, className`), but its only caller, `PlanEditor.tsx`, already holds `trainedSkills: ReadonlyMap<number, TrainedSkill>` (`PlanEditor.tsx:61,111`) and already threads it to sibling components (e.g. `trainedSkills={trainedSkills}` at `PlanEditor.tsx:426`). Verified: this is a one-line prop pass-through, not new wiring — confirmed trivial, not a real risk.
- `features/market/search.ts`'s current scope gap (only searches the 9,193 _referenced_ types, not all 26,981 published types) is a pre-existing, separate issue from this item — flagging it here only because the shared-search-helper refactor touches that file; do not silently expand its scope as part of this item unless the orchestrator wants that bundled in.
- Confirm whether "has-prerequisites" chip means "this skill requires other skills" (i.e., `prereqs.length > 0`, trivial) or "this skill is itself a prerequisite for something" (i.e., needs the Item 03 unlocks index) — the spec wording is ambiguous. I read it as the former (cheaper, no dependency on Item 03); if the orchestrator means the latter, this item gains a dependency on Item 03's skill→skill reverse index (still free, per payload budget (b), just a sequencing note).

---

## Downstream: items 07 (skill comparison) and 14 (Doctrine Designer)

Both will read SDE skill data — shape choices here affect them:

- **Ship the skill→skill reverse index (payload (b)) as a small shared utility now**, not buried inside item 03's panel code — item 07 (comparing two characters' skills) will very likely want "does character A have a prerequisite character B is missing" logic, which is the _same_ prereq/unlocks graph, just evaluated against two trained-skill maps instead of one. Don't let it become inspector-panel-private.
- **If item 14 (Doctrine Designer) needs "what skills does this doctrine ship require" at any point, that's exactly Item 03(c)'s skill→item index inverted (item→skills is already `dogma.extractRequiredSkills` today; skills→item is the new one).** Strongly recommend not building the skill→item index twice — if item 14 is coming in the same milestone window, build the index once, generalized, rather than shipping a narrow "for the inspector only" version now and a "for the doctrine designer" version later. This is the strongest argument for treating Item 03(c) as a shared-infrastructure investment rather than a one-view feature, even though it makes the item costlier up front.
- Whatever lazy-file naming convention item 03 establishes (`skillItemReqs.json` or similar) should be treated as a precedent — item 14 will add more lazy SDE chunks (fits/doctrines), and a consistent `loadX()` pattern in `src/sde/loadSde.ts` (mirroring the existing `cached()` helper) keeps that from becoming three different ad hoc fetch patterns.
