# Area C — Overview, Characters, multi-character (Items 02, 07, 09)

## Cross-cutting finding first (drives all three items)

**The predicted hazard ("global mutable token provider") does not exist in the ESI path — verified FALSE.**

- `configureEsi({ getToken })` is called exactly once, at module load (`src/app/App.tsx:31`), with `getToken: (characterId) => getValidAccessToken(characterId)`.
- The injected type is `GetToken = (characterId: number) => Promise<string>` (`src/esi/client.ts:20`) — parameterized per call, not a snapshot of "the active character."
- `esiFetch` consumes it per-request: `headers.Authorization = Bearer ${await tokenProvider(characterId)}` (`src/esi/client.ts:157-162`), where `characterId` comes from the caller's own `EsiFetchOptions`, never from a store.
- `getValidAccessToken` single-flights refreshes **per character** via `const inflightRefresh = new Map<number, Promise<string>>()` (`src/auth/session.ts`) — two different characters refresh concurrently with no collision; only same-character concurrent calls are coalesced (correctly — EVE rotates refresh tokens).
- `loadWithCache`/`loadWithCacheStatus` (`src/esi/cache.ts`) and every `features/*/data.ts` loader (`loadCharacterSkills`, `loadCharacterSkillQueue`, `loadWalletBalance`, ...) take `characterId` as an explicit parameter, not from `useActiveCharacter`.
- Precedent already in the repo: `usePublicInfo` (`src/stores/publicInfo.ts`) is fetched for **every** character in the roster today — `Characters.tsx:21-23` does `characters?.forEach((character) => void loadPublicInfo(character.characterId))`. Multi-character concurrent ESI fetching is a shipped pattern, not a hypothetical.

**Conclusion: fetching N characters' skill queues (or wallets) concurrently is not an architectural problem in the ESI/token layer.** `src/stores/activeCharacter.ts` only decides which character's data is _displayed by default on Overview_; it has zero coupling to which character's data _can be fetched_.

**The real global-slot hazard is one module over, in sync, not ESI.** `ensureSignedIn` (`src/sync/syncAuth.ts`) signs the single shared Firebase Auth session in/out per character (`uid = char:{characterId}`), and `planSync.ts`'s header comment states why syncs are serialized **globally** via one `syncChain` promise, not per character: "two concurrent syncs for different characters would race the auth state mid-flight." This constrains item 09's saved-setting sync (see below) but not item 02/07's read-only ESI fetches, which never touch Firebase.

**Real remaining constraint: no concurrency cap on ESI fan-out.** Nothing caps how many characters' requests are in flight at once. 20 characters × (queue + wallet) = 40 concurrent requests against ESI's global error-limit budget, and CLAUDE.md requires respecting `X-Ratelimit-*`/`Retry-After`. Precedent for the fix already exists: `features/character/typeNames.ts` caps concurrency at 10 (`docs/ARCHITECTURE.md` §4). Any new "fetch all characters" helper must reuse that pattern (or the same constant), not add a second concurrency policy.

---

## Shared mechanism (build once, items 02/07/09 all consume it)

**New module: `src/features/character/roster.ts`** (singular, sits next to the existing `src/features/character` dir per `docs/ARCHITECTURE.md` §2 — a plural `features/characters/` sibling would be confusing).

```ts
export interface RosterEntry {
  characterId: number;
  name: string;
  wallet: CachedResult<number> | null;
  skills: CachedResult<CharacterSkills> | null;
  queue: CachedResult<SkillQueueEntry[]> | null;
}

/** Cache-only by default (no live ESI call); live:true refreshes with a capped concurrency (reuse typeNames.ts's cap of 10). */
export function loadRosterSnapshot(opts?: { live?: boolean }): Promise<RosterEntry[]>;
```

- Composes existing per-character loaders (`loadWalletBalance`, `loadCharacterSkills`, `loadCharacterSkillQueue`) — does not reimplement read-through (`docs/ARCHITECTURE.md` §7 step 3).
- Cache-only mode reads `db.characters.toArray()` then, per character, `db.esiCache.get([characterId, key])` (or a `bulkGet` batch — see Item 02 for why `bulkGet`, not `.where('key')`, is required).
- `live: true` mode calls the `features/*` loaders directly (they already do ESI-or-cache), capped at 10 concurrent, for an explicit "Refresh all" action.

**Shared UI primitives needed (do not design private one-offs):**

- `DataTable` (currently ○ planned, `docs/DESIGN.md` §4) — item 07's comparison grid. DESIGN.md §5: "tables are the norm; avoid card grids for data lists."
- `CharacterAvatar` (currently ○ planned, `docs/DESIGN.md` §4) — three call sites already hand-roll `<img src={characterPortraitUrl(...)} className="rounded-xs ...">`: `Overview.tsx:98-104`, `Characters.tsx:58-64`, plus item 07's column headers and item 09's cards. Strong case for building it once now instead of a fourth hand-roll.

**Density flag for the orchestrator:** item 09 asks for a "compact density mode." Item 18 (separate, not in this area) is a font-scaling/density feature. Recommend item 18 owns exactly one `sync.uiDensity` setting; item 09 only _consumes_ it, and must not introduce a second `sync.overviewDensity` key. This is a naming/ownership collision the orchestrator must resolve before either item starts.

**E2E flag:** `e2e/support/mockEsi.ts:93` serves exactly one fixed `CHARACTER_ID`. All of items 02/07/09 need e2e coverage of a second character — one shared mock addition, assign to whichever item lands first.

---

## Item 02 — Queue health across all characters (teardown cost: S)

**Artifact claim:** "80% built. `src/routes/overviewQueue.ts` already derives the queue state; it only serves the active character today."

**Verdict:** PARTIALLY TRUE — the file is pure and character-agnostic, but it derives a _different_ thing than "queue health." (`src/routes/overviewQueue.ts:12-25`)

**Verified baseline:**

- `overviewQueue.ts` holds exactly one function, `selectActiveQueueEntry(entries, nowMs)`. It only imports `SkillQueueEntry`'s type (`@/esi/endpoints`) — no fetch/DOM/Dexie — and takes `nowMs` as a parameter instead of reading the clock itself. It is pure and works for any character's entry array; nothing in it is coupled to the active character.
- It answers "what is this character training _right now_," not "what is this character's queue health." It returns `null` for **both** an empty queue and a fully-paused queue (`start_date`/`finish_date` both absent on every entry) — those are two different status dots the feature needs (empty vs paused) and the function can't distinguish them.
- It never looks at the _last_ entry's `finish_date`, which is what "under 24h" / "under 5 days" needs.
- No existing test file: `ls src/routes/` shows `Overview.test.tsx` but no `overviewQueue.test.ts` — the pure function is currently untested.
- "It only serves the active character today" is true, but for an unrelated reason: `Overview.tsx:48-63`'s `useEffect` only calls `loadCharacterSkillQueue(activeCharacterId)` — a UI-loop scoping choice, not anything inherent to `overviewQueue.ts`.

**Gap:** A `deriveQueueHealth` function does not exist. Also need: fetching cached queue data for every character (roster module above), and a route/panel that lists all characters sorted worst-first with click-to-jump.

**Engine vs UI split:**

- New pure function `deriveQueueHealth(entries: readonly SkillQueueEntry[] | undefined, nowMs: number): QueueHealth` where `QueueHealth = { status: 'nodata' | 'empty' | 'paused' | 'urgent' | 'soon' | 'ok'; queueEndsAt: Date | null; activeEntry: SkillQueueEntry | null }`.
  - Must accept `undefined` (never-fetched / no cache row) distinctly from `[]` (fetched, empty queue) — the caller cannot collapse these before calling or the "unknown" and "urgent/empty" dots become indistinguishable. This is the sharpest correctness trap in this item.
  - `'paused'`: every entry present but none has `start_date`/`finish_date`.
  - `'urgent'`/`'soon'`/`'ok'`: computed off the _last_ entry's `finish_date` vs `nowMs` (thresholds: <24h urgent, <5d soon, else ok — per teardown's stated urgency bands).
- Placement: **not** `src/engine` — this operates directly on the ESI `SkillQueueEntry` shape, and engine's documented convention (`docs/ARCHITECTURE.md` §2) is engine-native types decoupled from ESI/SDE shapes at the boundary. Recommend `src/features/skills/queueHealth.ts`, colocated with the rest of the skills read-through layer.
- Latent violation to flag: `src/routes/overviewQueue.ts` already puts reusable logic in `routes/`, which `docs/ARCHITECTURE.md` §2 says routes must NOT do ("Own reusable logic other routes need — push into `features`/`engine`"). Since item 09 also needs per-character queue status for its "needs attention" sort, recommend moving `selectActiveQueueEntry` alongside the new `deriveQueueHealth` into `src/features/skills/queueHealth.ts` as one small shared refactor — flag for orchestrator sign-off since it touches a file item 02 didn't otherwise need to move.
- Sort ("worst-first") and click-to-jump are UI: `src/routes/Overview.tsx` (or a new `OverviewRoster` panel) + `useActiveCharacter().setActiveCharacter` + navigate.

**Can this be cached-only, no live multi-character fetch?** Yes — recommended v1. `db.esiCache` is keyed by compound primary key `[characterId, key]` (`src/db/index.ts`: `esiCache: '[characterId+key]'`) with **no secondary index on `key` alone** — `db.esiCache.where('key').equals('skillqueue')` will not work, but `db.esiCache.bulkGet(characterIds.map(id => [id, 'skillqueue']))` works directly against the compound primary key, no schema change needed. So a v1 that reads every character's _last cached_ skill-queue row (no live ESI call) is genuinely free of a Dexie migration. Recommend this exact approach for v1, with a per-character `DataAgeBadge` so a stale row is visibly stale (`docs/DESIGN.md` §4: "Required on every ESI-backed view").

**Files touched:**

- `src/routes/Overview.tsx` — add a "queue health across characters" panel (or new route section) that renders roster rows.
- `src/routes/overviewQueue.ts` — either keep as-is (only `selectActiveQueueEntry`, unchanged) or become the moved-out shell if the `features/skills` relocation above is approved.

**New modules:**

- `src/features/skills/queueHealth.ts` — `deriveQueueHealth` (pure, TDD-required).
- `src/features/character/roster.ts` — shared roster loader (see cross-cutting section); item 02 only needs the `queue` field, but build the full shape since 07/09 need `wallet`/`skills` too.

**Shared primitives needed:** `CharacterAvatar` (roster rows), `DataAgeBadge` (per-row, already ✓ in inventory — just wire it per row instead of once per page).

**Design tokens/components used:** `Panel` (wraps the roster list), `StatChip`-style status dot per row (or a small new status-dot token — confirm color mapping against DESIGN.md's accent/status tones, `docs/DESIGN.md` §1 "Accent + status" — reuse `warning`/`danger`/`success` tones already defined, don't invent new colors), uppercase micro-heading title, `rounded-xs` row treatment consistent with `Characters.tsx`'s existing card style.

**Tests:**

- `src/features/skills/queueHealth.test.ts` (new, TDD-required per CLAUDE.md — pure logic module): empty array → `'empty'`; all-paused entries → `'paused'`; undefined → `'nodata'`; last finish_date <24h/<5d/>5d → urgent/soon/ok; mixed paused+active entries.
- `src/features/character/roster.test.ts`: cache-only mode reads via `bulkGet` on compound keys, skips characters with no cached row, `live: true` mode respects the concurrency cap.
- e2e: extend `e2e/support/mockEsi.ts` with a second character's skillqueue fixture (shared need, see cross-cutting).

**i18n keys:** `overview.queueHealth.title`, `overview.queueHealth.status.{nodata,empty,paused,urgent,soon,ok}`, `overview.queueHealth.jumpTo` (aria-label for click-to-jump), reusing existing `overview.*` namespace style (`src/i18n/locales/en.json:239-248`).

**Sync / Dexie impact:** None. Cached-only v1 needs no `db.version()` bump (confirmed above) and adds no Editable Data field.

**New ESI scopes:** None. Overview already holds `esi-skills.read_skillqueue.v1` and `esi-wallet.read_character_wallet.v1` (`src/esi/scopes.ts:7-8,10`) for every character that's logged in; this item only reads what's already cached under those scopes.

**Cost:** Revise **S confirmed**, but for a different reason than the teardown claimed. The teardown credited existing derivation logic that doesn't actually exist for this purpose (`selectActiveQueueEntry` ≠ queue health); the real reason it's cheap is that the _data access_ problem (the task's stated worry) turns out to be free — cached-only via `bulkGet`, no new fetch path, no schema bump, no scope. The work is: one new pure function + tests, one roster loader (shared cost, amortized across 3 items), one UI panel.

**Depends on:** None strictly, but should land before/alongside 09 since 09's "needs attention" sort wants the same `deriveQueueHealth` output.

**Risks / open questions:**

- Whether to relocate `selectActiveQueueEntry` out of `routes/overviewQueue.ts` now (fixing the latent ARCHITECTURE.md §2 violation) or leave it and accept two homes for queue logic — orchestrator call.
- Status-dot color mapping needs a DESIGN.md decision (reuse existing status tones vs. add a new one) before implementation.

---

## Item 07 — Side-by-side character skill comparison (teardown cost: M)

**Artifact claim:** "New view, existing data. `features/skills/data.ts` already caches per character. Saved sets ride the existing `sync.` settings path."

**Verdict — data half:** CONFIRMED. `loadCharacterSkills(characterId)` (`src/features/skills/data.ts:38-44`) is already keyed by `characterId` and read-through cached; calling it for up to 10 characters is exactly the roster-loader pattern above, no new data-layer work.

**Verdict — saved-comparisons half:** PARTIALLY TRUE, with a defect that must shape the design, not just "ride the existing path."

**Verified baseline (sync):**

- `setSyncedSetting(key, value)` (`src/sync/planSync.ts`) requires `key.startsWith('sync.')` and writes to the flat Dexie `settings` table (`db.settings.put({ key, value })`) plus a timestamp in an internal meta map.
- `syncCharacter(characterId)` pushes **every** `sync.`-prefixed key currently in that flat table, under whichever character is presently syncing, to `/characters/char:{characterId}/settings/{key}` (`src/sync/syncAuth.ts`: `uidForCharacter`). `triggerSync` only ever runs for the **active** character (`src/app/App.tsx:62-65`).
- **`mergeSettings` has no tombstones** (`src/sync/merge.ts:149`, "No tombstones: keys are a stable set") — `for (const r of remote) if (!localKeys.has(r.key)) result.pull.push(r)` (`src/sync/merge.ts:163-165`) means a locally-deleted `sync.`-prefixed key is **resurrected** from remote on the next sync, since deletion isn't distinguishable from "never had it."
- Consequence for design: saved comparisons must NOT be stored one Dexie/Firestore key per saved set (e.g. `sync.skillComparison.{id}`), because deleting a saved comparison would just delete the local key, and the next sync would silently pull it back from the remote copy. **Required key shape: one key holding the whole collection as an array**, e.g. `sync.skillComparisons` = `SavedComparison[]` where `SavedComparison = { id, name, characterIds: number[], diffOnly: boolean, updatedAt }`. Add/remove/rename all go through one `setSyncedSetting('sync.skillComparisons', updatedArray)` call, so the whole-array LWW at that single key is well-defined (same pattern d90e417 uses for `markers?: number[]` living _inside_ a `SkillPlanRecord`, not as its own key).
- Same account-vs-character-scope defect as item 09 applies here too (a comparison naming 5 characters is account-level data): see item 09's writeup for the full analysis; recommendation carries over unchanged — accept per-character-remote-doc duplication for v1 with a documented caveat, do not build a new account-level Firestore path just for this.

**Gap:** No comparison UI exists; no `deriveQueueHealth`-equivalent needed here (comparison is skill-level-vs-skill-level, no queue math); no `sync.skillComparisons` key defined yet.

**Engine vs UI split:**

- Nothing belongs in `src/engine` — comparing trained skill levels across characters is a display/grouping concern over already-loaded data (`toTrainedSkillsMap`, `src/features/skills/skillMap.ts:39-45`), not new calculation logic.
- `src/features/skills/comparison.ts` (new, not engine): pure function `buildComparisonRows(catalog: SkillCatalog, perCharacterSkills: Map<characterId, CharacterSkills>, diffOnly: boolean): ComparisonRow[]`, grouping by `SkillType.groupName` (already present on `SkillCatalog.bySkillTypeID` rows, `src/features/skills/skillMap.ts:14`) and filtering to rows where levels differ when `diffOnly` is set. This is pure enough to unit test without Dexie/fetch, though it's not "engine" per the architecture doc's definition (engine = ESI/SDE-decoupled types) — keep it in `features/skills`.
- Route: new `src/routes/SkillComparison.tsx` (or a tab under `Skills.tsx`'s `SkillsSubNav`), wired into `App.tsx`.

**Perf/rendering:** ~400 skills × up to 10 characters = up to 4,000 cells. Recommend grouped-by-skill-group, **collapsed by default** (only totals/highest-level-gap rows expanded), combined with the differences-only toggle — for a typical comparison this drops the rendered row count by an order of magnitude and virtualization becomes unnecessary. Say this explicitly rather than leaving virtualization as an open question: build the collapsible-group + diff-toggle version first, only reach for a virtualized table if user testing shows the fully-expanded view is used often.

**Files touched:**

- `src/features/skills/skillMap.ts` — none required, `groupName` already available.
- `src/app/App.tsx` — new route registration.

**New modules:**

- `src/features/skills/comparison.ts` — pure row-building/grouping/diff logic.
- `src/routes/SkillComparison.tsx` — the view.
- (shared) `src/features/character/roster.ts` — reused, not duplicated.

**Shared primitives needed:** `DataTable` (○ in DESIGN.md §4) for the grid itself — this is the strongest single use case for finally building it. `CharacterAvatar` for column headers.

**Design tokens/components used:** `DataTable` (dense sortable, panel-2 header, tabular-nums), colour-coded level blocks should reuse existing status/accent tone tokens (`docs/DESIGN.md` §1) rather than a new palette — confirm exact level→color mapping is a design decision, not an engineering one. One primary button per view (`docs/DESIGN.md` §5) → "Save comparison" is the one primary action; diff-only is a toggle, not a button.

**Tests:**

- `src/features/skills/comparison.test.ts` (colocated): grouping correctness, diff-only filtering, empty-catalog/empty-roster edges.
- `src/sync/planSync.test.ts` extension (or new test) asserting `sync.skillComparisons` round-trips as a single array key — mirror the pattern in commit `d90e417`'s `planSync.test.ts` addition.
- e2e: second character fixture (shared need noted above) plus a comparison-view spec.

**i18n keys:** `skillComparison.title`, `skillComparison.addCharacter`, `skillComparison.diffOnly`, `skillComparison.save`, `skillComparison.saved.{empty,titlePlaceholder}`, `skillComparison.maxCharacters` (10-character cap message).

**Sync / Dexie impact:** New synced setting `sync.skillComparisons` (array-of-objects key, per the tombstone-resurrection analysis above). No `db.version()` bump — it's a `settings` table row like any other `sync.`-prefixed key, no new table/column. Must add the push/pull field mapping pattern per commit `d90e417`'s model, but since this is a bare synced setting (not a field on `SkillPlanRecord`/`BuildPlanRecord`), the "mapping" is just: it flows through `setSyncedSetting`/the existing generic settings sync block in `syncCharacter` (`src/sync/planSync.ts`, "Synced settings" section) automatically — no new `CollectionSpec` needed, unlike d90e417's plan-marker case.

**New ESI scopes:** None — reads only already-cached skills data.

**Cost:** Confirm **M**. Data layer is genuinely free (roster reuse); the cost is the new `DataTable`-based view, grouping/diff logic, and getting the saved-comparison key shape right (nontrivial given the tombstone gap above — a naive per-item-key design would ship a silent data-loss bug).

**Depends on:** `src/features/character/roster.ts` (shared with 02/09) — build once. `DataTable` component — if not yet built for another item, item 07 becomes the one that builds it; flag to orchestrator so it's not built twice.

**Risks / open questions:**

- Account-scope sync defect (shared with item 09) — same open decision, see item 09.
- Whether `DataTable` needs a "grouped/collapsible rows" mode as a first-class feature or whether item 07 hand-rolls grouping on top of a flat `DataTable` — affects `DataTable`'s own scope/cost if another item is building it concurrently.

---

## Item 09 — Overview groups, sort and density (teardown cost: M)

**Artifact claim:** "Missing. Only pays off once several characters are in. Store as a synced setting so grouping follows the user across devices — something EveLens cannot do."

**Verdict:** PARTIALLY TRUE on "missing" (confirmed, no grouping/sort/density code exists in `Overview.tsx`/`Characters.tsx`), but the **"store as a synced setting so it follows across devices" claim is not reliably true given how sync is scoped today** — this is the headline finding for this item, not a footnote.

**Verified baseline — the sync-scope defect:**

- `uidForCharacter(characterId) => 'char:' + characterId` (`src/sync/syncAuth.ts`) — the Firebase identity is **per character**, not per app-user/account, despite CONTEXT.md defining **Account** as "implicit app-level grouping of linked Characters, used only to sync editable data across devices" (`CONTEXT.md` glossary). That grouping concept is documented but has **no storage representation anywhere in the sync architecture** — there is no account-level Firestore path, only `/characters/char:{id}/...`.
- `triggerSync(characterId)` is invoked only for the currently-active character, on login/character-switch (`src/app/App.tsx:62-65`).
- Locally, `db.settings` is a **flat table, no characterId column** (`src/db/index.ts`: `settings: 'key'`) — so on one device, all characters already share one local value for any `sync.`-prefixed key. Reading/writing it doesn't care which character is active.
- But `syncCharacter` (`src/sync/planSync.ts`, "Synced settings" section) pushes **whichever `sync.`-prefixed keys exist in that flat table** to `/characters/char:{activeCharacterAtSyncTime}/settings/{key}` — i.e., the remote copy of an account-level setting like "overview grouping" ends up parked under one arbitrary character's remote doc, decided by sync-timing accident, not by design.
- **Failure mode:** same device, same browser profile → works by accident (flat table, single shared local value). **Second device**, user logs in as character B _first_ (character A never activated on that device) → `syncCharacter(B)` pulls only `char:B`'s settings docs → never sees the grouping value that was pushed under `char:A` on device 1. Silent, and the user has no way to notice — the grouping setting just quietly reverts to default on the new device.
- This is the same defect item 07's saved comparisons hit (a comparison naming 5 characters is inherently account-level data too) — one root cause, two symptoms.

**Options for the orchestrator (ranked):**

1. **Accept per-character duplication, document the caveat** (recommended for v1). Cheap — nothing new to build, `setSyncedSetting`/`syncCharacter` already do this. Caveat: a device that has never activated the character the setting happened to sync under won't see it. Works correctly as long as the user's devices each activate at least one common character occasionally — realistic for most multi-character users who switch chars in normal use.
2. **Push account-level keys under every character's doc, `max(updatedAt)` on pull.** A targeted change to `planSync.ts`'s settings block (loop all characters instead of the active one for a designated key subset). Fixes the propagation gap without a new backend concept. Moderate cost, touches shared sync code used by all synced settings.
3. **Real account-level Firestore path** (new uid concept distinct from `char:{id}`, new Firestore rules, `mintFirebaseToken` Cloud Function change to also mint/verify an account-level claim). Correct long-term fix matching CONTEXT.md's "Account" glossary entry, but this is infrastructure work, not a UI feature — should be scoped as its own item, not smuggled into item 09's estimate.

**Recommend (1) for v1**, flag (3) as a candidate standalone item for the orchestrator's backlog.

**Gap (functionality, beyond the sync question):**

- No grouping model exists — need `characterId -> groupId` mapping, drag-to-group interaction, group rename/dissolve.
- No "needs attention" sort — this is exactly `deriveQueueHealth`'s status ordering from item 02 (worst-first), so item 09 depends on item 02's function, not a separate sort implementation.
- Group totals for SP and ISK need **wallet balance per character**, not just skills — same roster-loader dependency as item 02 (`RosterEntry.wallet`), confirmed needed here explicitly since the teardown only mentioned skills data.
- Density mode: see cross-cutting section — do not build a second density setting; consume item 18's, flag ownership collision to orchestrator.

**Engine vs UI split:**

- Grouping assignment (`characterId -> groupId`) and group-total math (sum of `RosterEntry.wallet`/`skills.total_sp` per group) are simple aggregation, not calculation logic — no `engine` module needed. Put a pure `src/features/character/groups.ts` helper: `groupTotals(entries: RosterEntry[], groups: Record<number, string>): GroupTotal[]` for testability, but this is a features-level helper, not engine (no domain math, just sums).
- Drag-and-drop interaction and rendering: `src/routes/Overview.tsx` (or a new `OverviewRoster`-style component shared with item 02's panel — both want a "list of all characters with per-character status" view; strongly consider building ONE roster list component both items render into, with item 02 owning the health-dot/sort and item 09 owning the group/drag/density layer on top).

**Files touched:**

- `src/routes/Overview.tsx` — becomes multi-character-aware (today it's single-active-character only, `activeCharacterId` gate at `Overview.tsx:41`); needs to grow a "roster" section alongside (not replacing) the existing active-character detail view.
- `src/stores/activeCharacter.ts` — no change needed; grouping is orthogonal to which character is "active" for the detail view.

**New modules:**

- `src/features/character/groups.ts` — pure grouping/totals helper.
- (shared) `src/features/character/roster.ts` — reused from item 02.

**Shared primitives needed:** `CharacterAvatar` for cards, `DataTable` not needed here (card-grid-with-drag is the right shape per the feature's own description, an explicit exception to DESIGN.md §5's "avoid card grids" rule — justified because drag-to-group is a card-grid-native interaction).

**Design tokens/components used:** `Panel` per group, `StatChip` for group SP/ISK totals, existing `rounded-xs`/`border-line` card treatment already used in `Characters.tsx`. Density mode must reuse whatever token item 18 defines (spacing/font-scale), not invent new Tailwind classes locally.

**Tests:**

- `src/features/character/groups.test.ts` (colocated): totals sum correctly across a group, ungrouped characters handled, empty roster.
- `src/sync/planSync.test.ts` extension: `sync.overviewGroups` round-trips as a single object/array key (same tombstone-resurrection reasoning as item 07 — one key for the whole grouping map, never one key per group).
- e2e: drag-and-drop is hard to mock reliably in Playwright without a real DOM drag sequence — flag as a risk; consider testing group-assignment via a keyboard/menu fallback interaction instead of relying on e2e drag simulation for correctness coverage.

**i18n keys:** `overview.groups.title`, `overview.groups.new`, `overview.groups.rename`, `overview.groups.dissolve`, `overview.groups.totalSp`, `overview.groups.totalIsk`, `overview.sort.needsAttention`, `overview.density.compact` (only if item 18 doesn't already own this string).

**Sync / Dexie impact:** New synced setting `sync.overviewGroups` = `Record<characterId, groupId>` plus `sync.overviewGroupNames` = `Record<groupId, name>` (or one combined object) — single-key-per-collection, per the same `mergeSettings` tombstone-resurrection constraint as item 07. No `db.version()` bump (flat `settings` table, no new columns).

**New ESI scopes:** None — wallet + skills scopes already granted (`src/esi/scopes.ts:7,10`).

**Cost:** Report as **conditional, not a single number**: **M under option (1)** (accept per-character duplication, document caveat) — matches teardown. **L under option (3)** (real account-level sync) — do not let this item silently absorb that infrastructure cost. Recommend the orchestrator explicitly pick (1) vs (3) before sizing sign-off.

**Depends on:**

- Item 02's `deriveQueueHealth` (for "needs attention" sort) — land 02 first or concurrently, share the function.
- `src/features/character/roster.ts` (shared with 02/07).
- Item 18's density setting (consume, don't duplicate) — sequencing/ownership decision for orchestrator.

**Risks / open questions:**

- The account-vs-character sync scope defect (options 1/2/3 above) is the single biggest open decision in this whole area — it affects item 07 too. Recommend the orchestrator make ONE ruling that both items inherit, rather than deciding it twice.
- Whether items 02 and 09 should literally share one roster-list component (recommended) or ship two separate list renderings over the same `roster.ts` data — orchestrator call, affects both items' UI file list.
- Drag-and-drop e2e coverage gap noted above.
