# Feature parity — implementation plan

Source: a competitive teardown of NeoCom Desk against a rival skill planner,
items 01–18 and 20 (item 19, second language, is explicitly excluded — it
waits for a stable English UI). The rival is named only in
`docs/research/competitors.md`; nothing downstream of this plan needs it.

**Phases 0 and 1 have shipped** (see the status notes under each below);
phases 2-4 have not started. This document is the result of ten
parallel investigation passes over the codebase; each pass verified the
teardown's claims against source and recorded a verdict with `file:line`
citations. The per-item detail lives in [`briefs/`](./briefs/). This file is
the sequenced build order, which deliberately does **not** match the
teardown's value/cost ranking — that ranking was written without the
dependency graph below.

Terms follow [`CONTEXT.md`](../../../CONTEXT.md). Locations follow
[`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md).

---

## 1. Corrections to the baseline

The teardown reasoned partly from `docs/ARCHITECTURE.md` §6 and
`docs/DESIGN.md` §4, both of which are stale against `main`. Anything planned
against them mis-baselines.

| Doc claim                                                                     | Verified reality                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCHITECTURE §6: Remap Markers "in flight — no `Marker` implementation found" | Shipped — `features/skills/planner/markers.ts`, `engine/optimizer/optimizeAtMarkers.ts`, round-tripped through `db/index.ts` + `sync/planSync.ts` (commit `954eb16`, `d90e417`) |
| ARCHITECTURE §6: Market Browser "no route in `App.tsx`"                       | Shipped — `app/App.tsx:18`, `App.tsx:79`                                                                                                                                        |
| DESIGN §4: `SkillBar` planned (○)                                             | Shipped, but in `features/skills/SkillBar.tsx`, not `components/ui` — needs promotion                                                                                           |
| DESIGN §4: `DataTable` planned (○)                                            | Genuinely missing. Wanted by items 04, 07, 13, 16, 20                                                                                                                           |
| DESIGN §4: `CharacterAvatar` planned (○)                                      | Genuinely missing. Wanted by items 02, 07, 09                                                                                                                                   |
| DESIGN §3: control heights are "fixed pixels (`h-7` = 28px)"                  | Misleading. Tailwind v4's scale is rem-based (`tailwindcss/theme.css:325,347`); 28px is the _computed_ value at a 16px root                                                     |
| DESIGN §4: `DataTable` "dense **sortable** table", `panel-2` header fill      | Neither holds. No shipped table fills its header, and none needs sort state — every one pre-sorts in its own `useMemo`. Built presentational; §4 corrected in Phase 1           |
| DESIGN §4: `CharacterAvatar` `rounded-full`, "online/selected" ring           | All four shipped portraits are `rounded-xs`, the house radius (§3), and no online signal exists anywhere in the app. §4 corrected in Phase 1                                    |
| DESIGN §2: type-scale rules still prescribe `text-[11px]`                     | Contradicts Phase 0's px→rem sweep, which left zero `text-[11px]` in `src`. §2 corrected in Phase 1                                                                             |

Correcting both documents is part of Phase 0.

### Superseded approach: D3

This plan originally called for wiring `ReauthBanner` into the six views that
drop the `needsReauth` signal. That was rejected during implementation: it
duplicates the same logic nine times, and it only discovers the problem
_after_ a failed fetch, so the user watches a spinner resolve to an empty
table before any explanation appears.

What shipped instead is two central mechanisms plus one per-panel case:

- A **scope gate** on the route table compares the Character's stored grant
  against the route's required scopes — derived from `esi/registry.ts`, so
  scope strings are never copied — and renders the banner in place of the
  view, before any fetch.
- A **runtime auth-failure sink** (`stores/authFailure.ts`, fed by
  `esi/cache.ts`) covers the window where the stored grant is stale, because a
  revoke performed in EVE's third-party-application portal is invisible
  locally until the next token refresh.
- `/overview`, `/skills` and `/industry` span three scopes each, so they are
  left ungated and must degrade **per panel** — page-gating would hide panels
  that still work. Only Overview's wallet panel does so far; the rest still
  rely on the runtime sink, which means they keep the spinner-then-empty-table
  behaviour this approach was chosen to avoid. Outstanding, not done. Note the
  new `/skillqueue` reads on `/skills` and `/industry` widen this: a revoked
  queue scope now paints the shell notice over pages that still work.

The whole app also moved behind authentication (see `CONTEXT.md` round 4),
which removes the anonymous-state branch from the gate entirely.

### Current measurements

- **JS bundle: 185 KB gzip entry** (`index`), plus a **59 KB async `planSync` chunk**. Was 334 KB in one chunk; the `firestore/lite` alias and the deferred `@/sync` import (Phase 0) did it.
- **`public/data/` SDE payload: 2.29 MB** (blueprints 1.46 MB, types 0.73 MB, skills 0.11 MB) — already shipped to every user, and the budget items 03/04/16 draw against.
- 128 colocated unit test files; 4 Playwright specs.

---

## 2. Defects found during investigation

These are not teardown items. They are existing bugs the passes surfaced, and
several block or distort the features above them.

| #       | Defect                                                                                                                                                                                                                                                                                                   | Evidence                                                           | Severity                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| ~~D1~~  | ~~Sold Character leaves the previous owner's cached wallet, mail and assets in `esiCache`~~ **Fixed** — `handleOwnerHashChange` calls `purgeCharacterCacheOrSuppress`                                                                                                                                    | `sync/planSync.ts:208`                                             | Privacy                                                    |
| ~~D2~~  | ~~Granted scopes persisted but never read~~ **Fixed** — `purgeCacheIfConsentChangedOrPending` reads the stored set and diffs it with `revokedScopes`                                                                                                                                                     | `auth/session.ts:78`                                               | Privacy                                                    |
| D3      | **Partly fixed.** Overview's wallet panel now shows `ReauthBanner`; Assets, Mail, Calendar, Contracts, Orders and Overview's own queue panel still discard `needsReauth` and render as merely empty                                                                                                      | `components/ui/ReauthBanner.tsx` consumers                         | Correctness                                                |
| ~~D4~~  | ~~`paginated.ts` returns truncated data as complete~~ **Fixed** — `truncated` is a first-class field through `TruncatableResult` and the cache row, consumed by `/assets`                                                                                                                                | `esi/paginated.ts:15,68`, `routes/Assets.tsx:52`                   | Correctness                                                |
| ~~D5~~  | ~~`placeRemaps` is O(R²) synchronous on the main thread~~ **Fixed.** The R x R segment grid is gone: the DP now picks the allocation outside the search over boundaries, so it is linear in pair-runs. 200 steps, `remapCount = 5`: **2.04 s -> 13 ms** blind, 2.93 s -> 902 ms with a Booster. See §5.6 | `engine/optimizer/placeRemaps.ts`                                  | Performance                                                |
| ~~D6~~  | ~~The optimizer ignores Boosters while the computed queue applies them~~ **Fixed.** Ruled §5.5 (option b, teach the optimizer) and built: both placement paths are Booster-aware and `PlanEditor` passes the same Boosters the queue schedules with                                                      | `engine/optimizer/bestAttributes.ts`, `planner/PlanEditor.tsx:280` | Correctness — a wrong optimum, not just an undisclosed one |
| D7      | `dedupeEntries` rebuilds bare entry objects, so any new `PlanEntry` field is silently dropped on reorder                                                                                                                                                                                                 | `planner/reorder.ts:33`                                            | Latent                                                     |
| ~~D8~~  | ~~`role="dialog"` on plain `<div>`s, no focus containment~~ **Fixed** — both call sites use `components/ui/Modal.tsx`, built on native `<dialog>`/`showModal()`                                                                                                                                          | `components/ui/Modal.tsx:21-58`                                    | Accessibility                                              |
| ~~D9~~  | ~~Three hand-maintained scope lists, already drifted~~ **Fixed** — `scopes.ts` derives from `registry.ts` and the e2e fixture re-exports it; one source                                                                                                                                                  | `e2e/support/fixtureData.ts:29`                                    | Maintainability                                            |
| ~~D10~~ | ~~`formatIsk` implemented three times, only one clamping `-0`~~ **Fixed** — one copy                                                                                                                                                                                                                     | `lib/isk.ts:34`                                                    | Maintainability                                            |
| D11     | Assets fetches every page and renders all of it uncapped                                                                                                                                                                                                                                                 | `esi/paginated.ts` + `routes/Assets.tsx:164,167`                   | Performance                                                |
| D12     | `/assets` renders every player structure as `Structure #{{id}}`                                                                                                                                                                                                                                          | `routes/Assets.tsx:41`, `i18n/locales/en.json:300`                 | UX — fixed for free by the Phase 3 scope batch             |

---

## 3. Library survey: buy nothing

Ten surfaces were evaluated for build-vs-buy. **Recommended new
dependencies: none. Total added bundle cost: 0 KB.** Full reasoning in
[`briefs/K-libraries.md`](./briefs/K-libraries.md).

| Surface                  | Verdict          | Why                                                                                                                                                                                             |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable`              | **BUILD**        | The duplication across six tables is markup and class strings; TanStack Table is headless and emits none, removing zero of it for 13.5 KB. Sorting is ~6 lines of `.sort()` per site            |
| Virtualization           | **NOT NEEDED**   | 511 skills × 10 Characters ≈ 5,100 cells is an ordinary DOM. Assets is the one real risk — fix with a cap or `content-visibility: auto` (D11)                                                   |
| Dialog / popover / focus | **NATIVE**       | `<dialog>.showModal()` (Baseline 2022) and the Popover API (2025) fix D8 outright. Radix would be 27.5 KB for what the platform now does                                                        |
| XML parsing              | **NATIVE**       | `DOMParser` cannot do XXE at all; `fast-xml-parser` carries 4 CVEs and 21.6 KB. The security argument runs _against_ the dependency                                                             |
| Gzip                     | **NATIVE**       | `DecompressionStream('gzip')`, Baseline since 2023, and safer than `pako` — streaming lets you cap decompressed bytes, `pako.ungzip` materializes first                                         |
| CSV                      | **BUILD**        | No library does formula-injection sanitization or BOM handling, so the hard two-thirds stays ours regardless                                                                                    |
| Markdown                 | **BUILD (JSON)** | A Markdown body cannot route through i18next, so a renderer would violate CLAUDE.md                                                                                                             |
| Dates / durations        | **ALREADY HAVE** | `Intl.RelativeTimeFormat` would bypass i18next and reopen a bug `DataAgeBadge.tsx:15-21` already documents. `lib/duration.ts` encodes tested domain rules `Intl.DurationFormat` won't reproduce |
| Keyboard shortcuts       | **BUILD**        | Small registry; the hard parts are app-specific                                                                                                                                                 |
| Drag                     | **ALREADY HAVE** | `@dnd-kit`, and its `KeyboardSensor` is already wired at `planner/EntryList.tsx:142`                                                                                                            |

**The survey's most valuable finding was unrelated to the features, and it
shipped.** The repo imports eight Firestore symbols, all of which exist in
`firebase/firestore/lite`; `onSnapshot` had zero matches repo-wide. Aliasing
to `lite` and deferring the static `@/sync` import was projected to take the
bundle from 334 KB to ~175 KB gzip. Both are done — `sync/firebaseApp.ts` and
`planSync.ts` import from `firestore/lite`, and `sync/index.ts` is the
code-split boundary, every Firebase-reaching export behind
`await import('./planSync')`. **Delivered: a 185 KB gzip entry plus a 59 KB
async chunk**, close to the projection.

---

## 4. Build order

Cost labels follow the teardown: **S** = a few days, **M** = a week or two,
**L** = a milestone. Costs below are the _revised_ figures from investigation,
not the teardown's originals.

### Phase 0 — Foundation (no user-visible features)

Everything here unblocks something downstream or is a free win. None of it is
a teardown item, which is exactly why the teardown's ranking couldn't surface it.

| Task                                                                                                                                       | Cost | Unblocks                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------- |
| ~~Firestore `lite` alias + lazy `@/sync` import~~ **Done** — 334 KB single chunk → 185 KB entry + 59 KB async                              | S    | Everything — pure win                   |
| Fix `docs/ARCHITECTURE.md` §6 and `docs/DESIGN.md` §4                                                                                      | S    | Any future planning                     |
| **Endpoint registry**: one table mapping ESI endpoint → required scope → route template                                                    | S    | 15a, 17, D9                             |
| ~~Fix D1 — purge `esiCache` on owner-hash change. Start reading the stored scope set (D2)~~ **Done**                                       | S    | Privacy; supplies 15a's detection input |
| Central auth gate + route scope gate (D3) — **partly done**: `ScopeGate`/`AuthFailureNotice` ship, 4 routes still hand-wire `ReauthBanner` | S    | 13, 15b, 16, 20                         |
| ~~Signal truncation in `paginated.ts` (D4)~~ **Done**                                                                                      | S    | 17, 20                                  |
| ~~`placeRemaps` single-remap O(R) path (D5)~~ **Done**, and the general DP with it — see §5.6                                              | S    | **05**                                  |
| ~~Decide + build Booster semantics (D6)~~ **Done** — both placement paths Booster-aware, wired into `PlanEditor`. See §5.5                 | M    | 01, 05                                  |
| ~~`<dialog>` / Popover API migration (D8)~~ **Done** — `components/ui/Modal.tsx`                                                           | S    | 10, 15b, 17                             |
| ~~px→rem sweep, 40 arbitrary `text-[11px]`/`text-[10px]` sites~~ **Done** — none remain                                                    | S    | **18**                                  |
| ~~Promote `SkillBar` to `components/ui`; dedupe `formatIsk` (D10)~~ **Done**                                                               | S    | Consistency                             |

The endpoint registry deserves emphasis: it is the single highest-leverage
piece of work in this plan. Item 15a needs endpoint→scope, item 17 needs
endpoint→route-template, and D9 needs one source of truth for the scope list.
Built once, it collapses the cost of all three.

**Status: `src/esi/registry.ts` ships endpoint→scope only.** A speculative-
generality pass (pre-dating both items) removed two fields nothing read yet:
the `subject: 'character' | 'global'` tag and the `DIRECT_CALL_REGISTRY`
bucket for `market/{cost-index,esiPrices}.ts`'s unwrapped ESI calls. The
`route` template field survives — kept for `registry.test.ts`'s marker-comment
parity check — but has no runtime reader today. Re-add on demand:

- **Item 15a-ii** (surgical per-scope purge, see brief F): re-add the
  character/global distinction. `cachePurge.ts` currently does the blunt
  whole-character purge (15a-i) and doesn't need it.
- **Item 17** (activity log, see brief F): needs endpoint→route for every ESI
  call, including the two unwrapped ones — either route them through
  `endpoints.ts` wrappers first, or re-add a direct-call bucket alongside.
- Either re-add should restore the deleted registry test
  (`never marks a scoped endpoint as global, so its cached rows stay
purgeable`) — it was a real invariant, not incidental coverage.

### Phase 1 — Shared primitives

Build before the features that consume them, or the app fragments — this is
precisely where "feels part of the overall application" fails.

| Primitive                | Path                                    | Consumers                                                                                |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DataTable`              | `components/ui/DataTable.tsx`           | 04, 07, 13, 16, 20 — plus it absorbs the six duplicated tables                           |
| `CharacterAvatar`        | `components/ui/CharacterAvatar.tsx`     | 02, 07, 09                                                                               |
| `FilterChip`             | `components/ui/FilterChip.tsx`          | 04, and later 07, 14                                                                     |
| Route-lifecycle hook     | `features/character/`                   | ~50 lines of snapshot/loading boilerplate duplicated in `Wallet.tsx` and `Contracts.tsx` |
| `roster.ts`              | `features/character/roster.ts`          | 02, 07, 09, 14 — cache-only by default, capped-concurrency live mode                     |
| `rankedSearch`           | shared with `features/market/search.ts` | 04. `SkillPicker.tsx:26` has no relevance ranking at all today                           |
| `csv.ts` + `download.ts` | `src/lib/`                              | The serializer and download trigger only. Item 12's export surfaces land in Phase 2      |
| `useLocalSetting<T>`     | `src/lib/`                              | 11, 18, and 09's density toggle                                                          |
| **Settings route**       | `routes/Settings.tsx`                   | 11, 15b, 18. **No Settings surface exists anywhere in the app** — three items assume one |

Multi-character ESI access was expected to be a blocker and **is not**:
`configureEsi`'s `getToken` is parameterized per `characterId`
(`esi/client.ts:20`), `getValidAccessToken` single-flights per Character, and
`routes/Characters.tsx:21-23` already fans out concurrently. `roster.ts` is a
convenience layer over a shipped capability, not new infrastructure.

**Status: shipped.** All nine primitives exist, each with at least one
production consumer, and the routes were migrated onto them:

- `DataTable` absorbed five of the six duplicated tables (Contracts, Wallet's
  journal and transactions, Orders' open and history). `MaterialsTable` needs a
  density knob and `Market`'s table needs a `headerHidden` column option — both
  are real API decisions, not mechanical moves, so they were left.
- `useRouteSnapshot` (in `src/lib`, not `features/character` — nothing in it is
  character-domain) is used by all eight read-only Character routes.
  `features/industry/ActiveJobsPanel.tsx` still hand-rolls the pattern because
  it takes `characterId` as a prop rather than reading the store.
- `useLocalSetting` backs `useMarketHub`. `useActiveCharacter` was deliberately
  **not** migrated: 97 call sites, and it would trade a domain name
  (`activeCharacterId`) for a generic one (`value`).
- `FilterChip` has no consumer until item 04, and no tone variants yet — brief
  B asks for `StatChip`'s palette, which is item 04's call to make against a
  real use.
- `Settings` has no nav entry until item 18 lands the first real control.
- `csv.ts`/`download.ts`/`roster.ts` await their Phase 2/3 consumers by design.

### Phase 2 — Features on data we already hold

No new ESI scopes. No re-auth prompt. Ordered by dependency, then value.

| Item | Feature                                     | Cost   | Notes                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12   | CSV export — the four export surfaces       | S      | Consumes the Phase 1 `csv.ts`/`download.ts` helper                                                                                                                                                                                                                                 |
| 03   | Skill inspector — prerequisites and unlocks | S      | Skill→skill unlocks are **free**: already derivable from `skills.json`'s `prereqs` field, zero new bytes. The skill→**item** index is a separate, deferred piece (~605 KB raw / 66 KB gzip, 9,527 pairs)                                                                           |
| 04   | Search descriptions + filter chips          | S      | +84 KB raw / ~15 KB gzip for descriptions. Also fixes the missing ranking in `SkillPicker`                                                                                                                                                                                         |
| 01   | Remap schedule timeline                     | S      | Projected finish date and step→row mapping are genuinely absent, but neither forces an engine change                                                                                                                                                                               |
| 05   | Plan header + live optimization badge       | S      | **Only S because of the Phase 0 O(R) fix.** Exact for the single-remap default; `remapCount ≥ 2` needs an explicit ruling                                                                                                                                                          |
| 02   | Queue health across Characters              | S      | Cached-only v1 via `esiCache.bulkGet` — no schema bump, no new fetch path                                                                                                                                                                                                          |
| 11   | "What's new" after update                   | S      | Needs `__APP_VERSION__` define + bundled `changelog.json`. Fetching GitHub Releases would add an external dependency to a deliberately closed list                                                                                                                                 |
| 18   | Font scaling                                | S      | Only S because of the Phase 0 rem sweep and the Phase 1 Settings route                                                                                                                                                                                                             |
| 10   | Keyboard shortcuts                          | S      | Only S because Phase 0 supplies the modal system and Phase 1 the Settings route — two of its four shortcuts had no target                                                                                                                                                          |
| 06   | Import `.emp` / plan XML                    | S/M    | **The switching-cost lever.** Verified against EVEMon source: gzip'd XML, `<plan>` root, `<entry skillID skill level priority type>`. Its `priority` attribute is item 08's field arriving free                                                                                    |
| 08   | Skill priorities and bands                  | M      | **No Dexie bump, no sync mapping** — `priority` nests inside `entries`, which `planSync.ts:350` passes wholesale. Real cost is the `reorderSuggestion` refactor and prereq-priority semantics. Must fix D7 first                                                                   |
| 07   | Side-by-side skill comparison               | M      | Blocks on `DataTable` + `CharacterAvatar` + `roster.ts`                                                                                                                                                                                                                            |
| 09   | Overview groups, sort, density              | M or L | **Decision required — see §5.** Item 18 owns the scale mechanism; item 09 owns density and must not redefine it                                                                                                                                                                    |
| 17   | Activity log                                | M      | Events must be a closed union with route-_template_ literals — never built URLs (`buildUrl` folds query params in; `mail/{mailId}` carries ids in the path) and never `EsiError.message` (lifted from response bodies). One i18n key per event kind, plus a named leak-canary test |

### Phase 3 — The single batched re-authorization

Every added scope forces **every** Character to log in again. This must happen
exactly once.

```
esi-clones.read_clones.v1              item 13   required
esi-planets.manage_planets.v1          item 16   required
esi-universe.read_structures.v1        item 13   strongly recommended — also fixes D12
esi-characters.read_contacts.v1        item 20   required — contacts is in the batch
esi-characters.read_loyalty.v1         item 20   required — loyalty points is in the batch
```

Everything else these features need is public: planet, system, station and
schematic names, type info, and **employment history** — which is a public
endpoint (`security: []`, verified against the live ESI OpenAPI), contradicting
the teardown's "every one costs a re-auth prompt."

Sequencing: **item 15a ships before this batch** (it is an independent privacy
fix, and it makes the forced re-auth safe). **Item 15b ships after** — its
scope-category grouping would be rebuilt the moment four scopes land. The
additive case must be a no-op: adding scopes must not purge every cache, and
that needs its own named test.

| Item | Feature                               | Cost | Notes                                                                                                                                                      |
| ---- | ------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15a  | Cache purge on scope revoke           | S    | Ships **before** the batch. Blunt purge of character-scoped rows first; `GLOBAL_CACHE_CHARACTER_ID` rows are public and must be spared                     |
| 13   | Clone and implant tab                 | M    | Jump cooldown is `24h − 1h/level`, floor 19h — pure math, `src/engine/clones.ts`, TDD, `nowMs` injected                                                    |
| 16   | Planetary industry                    | M    | Revised **down from L**. SDE delta measured by building it: **+20 KB on 2.29 MB (+0.9%)**                                                                  |
| 20   | Niche tabs — contacts, loyalty points | S–M  | One ticket each; both need the batch above. **Employment history is public and ships in Phase 2, not here.** Defer notifications and kill log indefinitely |
| 15b  | Scope picker at login                 | M    | Ships **after** the batch. Strictly local, never a `sync.` setting — a synced value would contradict the device's actual token grant                       |

Two traps to carry into implementation:

- `/universe/structures/{id}` returns **403 for any structure off its ACL, even holding the scope**. `esi/client.ts:63` treats every 403 as an auth failure, so a naive wiring pins `ReauthBanner` on permanently for anyone with a clone in an inaccessible structure. Needs a `detectAuthFailure` override that keeps 401 and drops 403.
- ESI only recalculates planetary data **when the colony is viewed in the game client**. `expiry_time` / `cycle_time` / `qty_per_cycle` are trustworthy; `contents[].amount` and `last_cycle_start` are not. Idle and expiry warnings run entirely on the trustworthy fields — storage-fullness and chain-stall readouts would display confident wrong numbers. This is what shapes the v1 scope.

Also: items 04 and 16 both edit the same three regions of `scripts/build-sde.mjs`. Sequence them, don't parallelize them.

### Phase 4 — Doctrine Designer (item 14)

Cost **L confirmed**, but redistributed. Single-Character v1 (slices 0–5:
storage/sync → authoring → gap math → readout → generate) is roughly upper-M.
The N×M comparison grid — which _is_ the differentiator — is 1.5–2.5 weeks on
its own and blocks on `DataTable` + `CharacterAvatar`.

- **Authoring is near-free.** EFT fit → required skills already ships end to end (`engine/import/eftFit.ts:47` → `fitToSkills.ts:53` → `planner/clipboardImport.ts:141`), and `ImportClipboardDialog` is already parameterized by `onApply(entries)`. Doctrine authoring is a call site.
- **Cross-user corp sharing is out of scope.** `mintFirebaseToken` returns only `{token, uid, ownerHash}` — no corp claim exists. Sharing would need a non-`/characters` doc root, a write-authority model, claim minting, and `esi-characters.read_corporation_roles.v1`. The in-scope alternative is export/import of a JSON payload, which pairs naturally with item 06. **Record as ADR 0003.**
- **Doctrine → Skill Plan is a snapshot generate, not a live link.** A live link races whole-record LWW against hand-edited plans. Keep `sourceDoctrineId` for a manual regenerate.
- Non-obvious: `fitToSkills` sorts by `skillTypeID` and `normalizePlan` preserves input order, so generate **must** run `suggestReorder` or it emits a typeID-ordered plan.
- New pure functions compose existing engine math (`normalizePlan` + `computeSchedule`) and must never throw — `plan.ts:24,27` throws on unknown typeID, and a fit-derived Doctrine can carry a typeID absent from the SDE snapshot.
- Needs `db.version(4)`, one `firestore.rules` block mirroring lines 41-47, no `firestore.indexes.json` change, and the `d90e417` push/pull pattern in three places.

---

## 5. Decisions required before Phase 2 closes

These change what gets built. They are yours, not the implementer's.

1. ~~**Sync scope (blocks items 07 and 09).**~~ **DECIDED 2026-08-30 — see §5.7. Items 07 and 09 are unblocked and store device-local; no account sync, no uid change.**
2. ~~**The PI consent string.**~~ **DECIDED 2026-08-30 — ship item 16, and disclose it.** `esi-planets.manage_planets.v1` grants only two GETs in item 16's surface, but the SSO consent screen reads _"manage your planetary installations"_. CCP publishes no read-only PI scope, so that wording is theirs, not a widening of ours. Three conditions: say so plainly on the login screen beside the PI scope; record it in an ADR; and footnote CONTEXT.md's "Read-only: no ESI write scopes" rather than leave it flatly contradicted. The footnote must make the distinction the claim actually rests on — the app issues no ESI writes, which stays true at the behaviour level whatever the consent screen says. The scope is not in `esi/registry.ts` today; it arrives with item 16.
3. ~~**Item 05's badge at `remapCount ≥ 2`.**~~ **Resolved 2026-08-30 by §5.6**, both branches, at different thresholds: exact placement now ships up to `remapCount` = 2, and above that `plans.remapCapNote` states the cap honestly instead of guessing. Reopen only if 5 moves off the main thread.
4. ~~**Which niche tabs (item 20).**~~ **DECIDED 2026-08-30 — all three: employment history, contacts, loyalty points.** One ticket each rather than one for item 20, because they do not share a dependency: **employment history is a public endpoint** (`security: []`), needing no scope, no re-auth and no batch, so it ships in Phase 2; **contacts** and **loyalty points** each add a scope and must join the single batched re-authorization in Phase 3. The scope batch is what groups them — the features are independent. Still recommended never: notifications (the `text` field is raw YAML needing per-type templates for 150+ types, sourced from neither ESI nor the SDE) and kill log (link zKillboard instead).
5. **Boosters in the optimizer (D6). DECIDED 2026-08-30 — option (b), teach the optimizer.**
   `bestAttributes` must account for Boosters. The label-only option (a) was
   ruled first and reversed the same day; see the note below, and do not
   re-derive it from the old rationale.

   **Why (a) was wrong.** It rested on Boosters being short-lived — a bonus
   that "dies in hours", not worth distorting a months-long plan for. That is
   false. Long-duration accelerators run to roughly three weeks, and character
   skills extend them further, so a Booster covers a material fraction of a
   real plan. An optimizer blind to that picks the wrong attributes for weeks
   of training, which is a wrong answer, not a disclosure problem.

   **What this costs, and the shape that contains it.** The existing objective
   aggregates SP by (primary, secondary) pair and is therefore
   order-independent (`bestAttributesForPairs`). A Booster expiring mid-segment
   makes the rate depend on _when_ each step trains, which that aggregation
   cannot express. Two cases, and only one is expensive:

   - Booster covers the whole segment → fold its bonus into `implants` and the
     current fast path is already correct, unchanged.
   - Booster expires mid-segment → needs an ordered walk with the rate changing
     at the expiry breakpoint, i.e. what `computeSchedule` already does.

   Route to the slow evaluator **only on overlap**. A Booster window touches
   the first segment or two; every later segment keeps the fast path, and every
   existing `bestAttributes` test keeps passing.

   **Measured 2026-08-30, and the hybrid holds.** 2,885 allocations, synthetic
   plan, 21-day booster. Per `bestAttributes` call:

   | Plan      | Pair aggregation (today) | Naive ordered walk | Walk-then-aggregate hybrid |
   | --------- | ------------------------ | ------------------ | -------------------------- |
   | 50 steps  | 0.39 ms                  | 13 ms (34×)        | **2.4 ms (6×)**            |
   | 200 steps | 0.31 ms                  | 48 ms (154×)       | **3.9 ms (12.5×)**         |

   The hybrid returns the same optimum as the naive walk (asserted in the
   benchmark, not assumed). The trick: walk only while the booster is live,
   then use the existing order-independent pair aggregation for the
   constant-rate tail, with suffix SP-per-pair sums precomputed once so the
   tail is O(pairs) at any plan length. The walked prefix is bounded by what
   trains inside the booster window, not by plan length — which is why 200
   steps costs barely more than 50.

   **`placeRemaps` threading and the DP cost are resolved — see §5.6.** Both
   placement paths are Booster-aware, the UI is wired (`PlanEditor` passes the
   same Boosters the computed queue schedules with), and `MAX_SUPPORTED_REMAPS`
   is 2. The batching this section once described as a known future fix shipped
   as `bestAttributesAtBoundaries`, and the segment grid whose memo made the
   old cost bearable is gone. **§5.6 carries the current measurements. The
   figures once quoted here — 2.2 s blind and 21.7 s Booster-aware at
   `remapCount` 5 — described code that no longer exists.**

   Useful context for §5 decision 3: a 24-day Booster covers the first **5
   steps (3%)** of a 200-step plan, because such a plan runs ~1,100 days.

   Binding on items 01 and 05: they render one number, computed one way. The
   "excludes booster" note option (a) called for must not ship.

---

## 5.7 Sync scope — decided, and why the obvious answer is wrong

**Decided 2026-08-30.** Items 07 and 09 store their state **device-local**.
Neither the Firebase uid nor the Firestore layout changes.

### What the original framing got wrong

It offered (a) accept per-Character duplication, or (b) build account-level
sync at cost L. Both rest on assumptions that do not hold.

- **Crossing Characters is already free.** `db.settings` is a flat key-value
  table with no `characterId` column, so on one device a grouping made under
  Character A is already visible under B. Sync buys exactly one thing:
  the same value on a second device.
- **There is nothing to migrate.** No production `sync.`-prefixed key exists.
  The settings sync path is built and has no producers. The trade-hub
  preference people assume is synced is device-local (`marketHub`).
- **Option (b) is not an L. It is a rewrite of the trust boundary.** EVE SSO
  exposes **no account identifier** — `sub` is per-Character and `owner` is
  the ownerHash, which changes on transfer. So an account grouping would be
  app-invented and **client-asserted**, strictly weaker than today, where
  `mintFirebaseToken` derives the uid from a JWT verified against CCP's JWKS.
  Worse, `firestore.rules` gates every read on
  `resource.data.ownerHash == request.auth.token.ownerHash`, a claim minted
  from one Character's token. Under an account uid, sibling Characters' docs
  carry different hashes and are excluded by both the client query and the
  rules. Option (b) therefore means replacing the ownership model and
  rebuilding the transfer-privacy story that D1 exists to protect.

### The decision

Ship 07 and 09 device-local, as `marketHub` already is. Both are then correct
on any single device, item 09 drops from L, and both unblock immediately.

Store each as **one object-or-array-valued key carrying its own `updatedAt`**,
shaped as a synced key would be but **without** the `sync.` prefix — that
prefix is what `isSyncedSettingKey` gates on, and using it would silently turn
sync on. A later flip is then a rename plus a one-time copy, not a reshape.

**Known cost, accepted:** a grouping made on your desktop does not reach your
phone.

### If sync is wanted later, build fan-out — not account scoping

Write the key under **every Character the device knows**, and take
`max(updatedAt)` on pull. No new identity, no rules change, no trust-boundary
rewrite, and it matches the local model, which is already flat. Its cost is
write amplification, and a Character never activated on that device never
receives the value.

**Option (b), account-level sync, is REJECTED, not merely unchosen** — for the
SSO and ownerHash reasons above. Recorded because it is the intuitive answer,
and the next person to reach for it will not otherwise know what it breaks.

### Consequences, each its own ticket

1. **Give `mergeSettings` tombstones.** Today any remote key absent locally is
   pulled straight back, so a deleted setting resurrects. Copy the tested
   pattern from `mergeRecords`, reusing `TOMBSTONE_TTL_MS` (30 days) for the
   remote doc. The **local** tombstone is not TTL'd: it persists and is
   superseded by a newer write to that key. Done now, while there are no
   producers and it is cheap — a known-broken merge left in the tree behind an
   explanatory comment is exactly the shape of brief E's BOM instruction.
   This also retires the old "never one key per item" rule.
2. **Guard the `sync.` prefix with an allow-list test.** `planSync.ts` already
   throws if a synced key lacks the prefix; nothing guards the reverse, and
   adding one is a one-line change whose failure only shows up on a second
   device weeks later. A colocated test asserting the production `sync.` key
   set matches an explicit allow-list makes it a deliberate two-file edit.
3. ~~**Character removal, with its purge.**~~ **Done** (#39,
   `features/character/removeCharacter.ts`) — purges that Character's remote
   docs inline at removal, and if its refresh token is dead (the common case
   for a sold Character) records a pending purge (`sync/characterPurge.ts`)
   that `sync/planSync.syncCharacter` runs the next time that Character
   authenticates. No new privileged endpoint: `firestore.rules` grants
   `delete` on uid alone, deliberately, so a purge only needs a session as
   that Character. **Caveat, still true:** if the user never signs in as it
   again, the remote data stays. Only a privileged Cloud Function would
   guarantee the purge, and that is a new trust surface.
   Closes the asymmetry D1 leaves open — D1 handles a Character sold out from
   under you; this handles one you deliberately drop.

### CONTEXT.md change, not yet applied

`CONTEXT.md` was checked out by another session when this was decided, so its
**Account** line is left for whoever holds that file. Replace it with:

> - **Account**: UI-level grouping of a user's Characters. Has **no storage,
>   no sync and no server-side identity** — EVE SSO exposes no account
>   identifier, so one cannot be verified. Groupings are device-local by
>   decision (§5.7), not by omission.

---

## 5b. Added after the teardown (user-requested 2026-08-30)

Not teardown items. Verified against the live ESI OpenAPI
(`https://esi.evetech.net/meta/openapi.json`) before scoping.

### The skill queue tells you things `/skills` does not

Both route descriptions say so outright. `/skillqueue`:

> "Entries that have their finish time in the past are completed, but aren't
> updated in the "/skills" route yet. This will happen the next time the
> character logs in."

`/skills`:

> "Skills returned by this route can be out-of-date if the character hasn't
> logged in since one or more skills completed training. Use the /skillqueue
> route to check for skills that completed training. Entries that are in the
> past need to be applied on top of this list to get an accurate view."

Three consequences, in ascending order of how much they matter:

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                               | Cost               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| P1  | **Time remaining on the training skill.** ESI's `finish_date` is authoritative — it reflects real current SP. `CurrentQueuePanel` today _recomputes_ the schedule from attributes and ignores it, so its head-of-queue number is an estimate presented as fact                                                                                                                                                     | S                  |
| P2  | **Keep completed entries visible** until the character next logs in, badged as done. This is not a hack — an entry with a past `finish_date` is exactly what ESI says to surface                                                                                                                                                                                                                                   | S                  |
| P4  | **Mark which skills a live Booster actually speeds up**, with an icon. Two conditions, both required: the skill's primary or secondary attribute appears in `Booster.bonus`, _and_ the step trains before `expiresAt`. Falls out of the booster-aware walk in §5.5 — that walk already knows which steps sit inside the window, so this renders engine output rather than adding math. Build with §5.5, not before | S (on top of §5.5) |
| P3  | **`/skills` is stale until login, everywhere.** `trainedSkills` feeds plan normalization and the optimizer, so a plan can be computed against skill levels the character already trained past. Applying past-`finish_date` queue entries on top is the documented fix                                                                                                                                              | M                  |

P1 and P2 shipped together. P4 shipped with §5.5.

**P3 shipped.** `completedQueueLevels` and `applyCompletedQueueEntries`
(`features/skills/queueStatus.ts`) fold past-`finish_date` entries on top of
`/skills`, reusing `classifySkillQueue` so the paused rule is defined once.
Four surfaces read them: `routes/SkillPlans.tsx` (the defect — plan
normalization and the optimizer), `routes/Skills.tsx` (levels and SP, which
also feeds the CSV), `routes/Industry.tsx` (industry math) and
`routes/Overview.tsx` (total SP). Notes:

- **SP only rises when ESI supplies `level_end_sp`,** which is optional. The
  engine schedules from `level` alone, so a raised level beside a stale `sp`
  costs display precision, not a wrong plan. A skill `/skills` already lists
  keeps its last known SP beside the raised level; one `/skills` omits
  entirely has no SP to keep, so the row shows a dash rather than 0.
- **`total_sp` is stale by the same amount** and is corrected with
  `completedSpGain`, on `/skills` and `/overview` both — otherwise a page
  shows a raised per-skill SP inside a total that still counts the old one.
  The correction covers exactly the entries whose per-skill SP rose, so the
  total is never more precise than the rows it sums.
- **`unallocated_sp` is deliberately unchanged.** Training does not draw from
  that pool — it is filled by injectors and event rewards — so a finished
  queue entry leaves it accurate.
- **`finished_level` is validated, not trusted.** `SkillQueueEntry` is a cast
  over an ESI response and over whatever Dexie replays for it. A level outside
  1..5 throws in `engine/industry/time.ts` and silently empties a plan in
  `normalizePlan`, so such a row is dropped and `/skills` stands.
- **`features/character/roster.ts` was left alone.** It holds raw
  `CharacterSkills` but has no importer outside its own test, so nothing
  renders it. Fold it in when it gains a consumer.

### Field-level facts that constrain the build

- **Only `queue_position`, `skill_id`, `finished_level` are required.** Every
  date and SP field — `start_date`, `finish_date`, `level_start_sp`,
  `level_end_sp`, `training_start_sp` — is optional and absent on a paused
  queue. Nothing may dereference them unchecked.
- **There is no `training_start_date`.** The field is `start_date`.
  `engine/queueImport.ts` had invented the wrong name; corrected.
- **An absent date means "paused, ETA unknown" — never "starts now".**
  EVEMon shipped this bug (`peterhaneve/evemon#40`): it synthesized a start
  time for paused entries and then marked skills falsely complete on
  re-import. A paused entry belongs in neither the trained nor the pending
  bucket.
- **Staleness has two unrelated mechanisms.** The route's ~60 s cache
  (`x-cache-age: 60`) bounds ordinary staleness; the unpruned-completed-entry
  state persists _indefinitely_ until login. Do not conflate them.
- **"Dismiss the notification" is not observable.** No field in the schema
  exposes notification state, and no source supports a dismissal step. Login
  is the only trigger. Scope P2 to login, not dismissal.

### Booster durations (the evidence that reversed D6)

Genius 'Boost' Cerebral Accelerator: +12 to all learning attributes, **12 days
base, 24 days at Biology V**. Expert 'Boost': 10 days base, +10. Biology is the
only skill affecting duration (+20%/level). Confirms a Booster spans weeks of a
plan, which is what makes §5.5 option (b) the correct ruling.

---

## 5.6 D5 — the O(R²) segment grid, and why it is gone

**Shipped 2026-08-30.**

`placeRemaps` used to build an R x R grid of segment costs, every cell a
2,885-way allocation brute force, before running the DP over it. That is what
made `remapCount >= 2` cost ~2 s on a 200-step plan.

The fix is an identity, not a micro-optimisation. Booster-blind segment cost
is **linear in SP** — `timeToTrain` is `(sp / rate) * 60`, no rounding — so
for a fixed allocation `a` a segment's cost is a difference of prefix sums,
`F(a, j) - F(a, i)`. That lets the allocation be chosen _outside_ the search
over boundaries:

```
min over i of ( dp[k-1][i] + cost(i, j) )
  = min over a of ( F(a, j) + min over i of ( dp[k-1][i] - F(a, i) ) )
```

The inner minimum is a running scan, and `F` accumulates in O(1) per run. So
each remap level costs O(allocations x R) instead of O(R² x allocations x
pairs). `bestAttributes.allocationCostTable` is the seam: it hands out
seconds-per-SP for every allocation x pair, and brute-forces nothing. It and
`bestAttributesForPairs` share one rate formula — the table picks the segment
that `bestAttributesForPairs` then re-prices, so a formula edit reaching only
one of them would make the chosen segment and the reported duration disagree
in silence.

**Measured, 200 steps, before -> after:**

| `remapCount` | Booster-blind   | 24-day Booster   |
| ------------ | --------------- | ---------------- |
| 1            | 56 ms -> 59 ms  | 76 ms -> 81 ms   |
| 2            | 1.98 s -> 6 ms  | 2.41 s -> 419 ms |
| 3            | 2.02 s -> 8 ms  | 2.68 s -> 583 ms |
| 5            | 2.04 s -> 13 ms | 2.93 s -> 902 ms |

Three things worth carrying forward:

- **Prefix subtraction reassociates the float sum**, so those costs choose
  boundaries and are never reported. Each chosen segment is re-priced exactly
  by `bestAttributesForPairs`, so blind totals are unchanged to the last
  printed digit. Where two splits tie, the new scan can pick a different —
  equally optimal, and earlier — one.
- **Boosted segments stay a separate candidate**, taken as the lower of the
  two. That is sound because a Booster only raises attributes, so its cost is
  never above the blind cost for the same segment.
- **What remains under a Booster is the ordered walk itself.** A mid-segment
  expiry makes cost depend on when a segment starts, so those segments cannot
  be priced by aggregation at all. Only segments starting before the last
  Booster lapses pay it.

**`MAX_SUPPORTED_REMAPS` raised 1 -> 2** (user decision, 2026-08-30).

Read the right column when judging this. `PlanEditor` passes a `booster`
whenever the user has one enabled, so the cost per button press is **~420 ms
at `remapCount = 2` and ~900 ms at 5**, not the 6-13 ms of the blind column.
That cost cannot be restructured away — a mid-segment expiry defeats
aggregation outright — so 5 stays out until the work moves off the main
thread.

Two things make 2 cheap in practice:

- **`remapCount = 1` never enters this DP.** It takes the O(R) suffix scan, so
  it is unchanged at ~59-81 ms.
- **Most characters hold one remap.** `remapCount` is prefilled from
  `remapAvailability` (ESI bonus remaps plus the yearly one off cooldown), and
  the common case is 1. The 420 ms lands only on plans that actually asked for
  two.

`plans.remapCapNote` said "multi-remap placement is not available yet", which
the raise makes false; it now reads "placement beyond that". **§5 decision 3
(the savings badge above one remap) is now live rather than doubly
unavailable** — the optimizer really does return two remapped segments.

### Found while reviewing D5, not fixed: stacked Boosters share one expiry

`placeRemaps` took its expiry cutoff from the **earliest** live Booster, so
segments starting after the first lapse were priced Booster-blind while a
longer Booster was still running — holding a throwaway Booster could make the
optimizer return a _worse_ answer than not holding it. Fixed here: the cutoff
is the last lapse, and a test pins it.

Underneath it sits a second, deeper one that is **not** fixed.
`bestAttributes` stacks every live Booster's bonus but applies the stack only
until the earliest expiry — its own docstring says so, calling it
under-crediting rather than over-crediting. With a long Booster and a short
one that is a large under-credit, and at `remapCount >= 2` it still picks a
worse split. Fixing it means giving the ordered walk piecewise bonuses over
time, which is the multi-Booster model, not D5.

**Unreachable today:** `PlanEditor.tsx` builds `activeBoosters` from a single
Booster form, so the list never holds two. `BoosterContext.boosters` is
`readonly Booster[]`, so it is reachable the moment a second Booster becomes
enterable — schedule this before that UI, not after.

### Also found while reviewing, also not fixed

- **The correction lives in four route components, not under them.**
  `SkillPlans`, `Skills`, `Industry` and `Overview` each remember to apply
  finished queue entries, and a fifth surface must remember too. The mechanism
  that should absorb it is a composing loader in `features/skills/data.ts` —
  `loadImplantBonuses` is the precedent, already composing two reads. It has
  to return the merged `CharacterSkills` **and** the provenance map, because
  `/skills` needs per-skill "did the queue win" plus the leftovers for skills
  `/skills` omits; and `nowMs` has to be a parameter, keeping `data.ts`
  clock-free. `esi/cache.ts` cannot express it: `loadWithCache` is one
  `[characterId, key]` row with one fetcher, and the merge is time-dependent,
  so writing it back would clobber the true payload with a snapshot. Note
  `fetchedAt` then has to become the **older** of the two rows, or Data Age
  overstates freshness — a question the four routes currently dodge by never
  asking it. Callers: four routes plus **both** roster read paths, including
  `roster.ts` `loadCacheOnly`, which bulk-reads the cache and never goes
  through `loadCharacterSkills` at all.
- **`esi/cache.ts` has no TTL and no in-flight dedupe.** Navigating
  Overview -> Skills -> Plans -> Industry now makes four identical
  `/skillqueue` round trips and four Dexie writes where one would do. The
  layer is pre-existing; P3 is what made it bite, by putting the same endpoint
  on four routes.
- **`AllocationCostTable.attributesAt` has no production caller.** Chosen
  attributes come from `exactSegment` or the boosted batch, never the table.
  Kept as the seam the table's tests check the allocation set through.

---

## 6. What was excluded

- **Item 19** (second language) — excluded by request; correctly gated on a stable English UI.
- Teardown items 21–26 were outside the requested range. Items 21/22 (background refresh, scheduler) conflict with CONTEXT.md's "refresh on app open + manual button only" and need a scope decision first. Items 23–24 are platform-inaccessible or already solved differently. Items 25–26 the teardown itself rejects.
- The **skill→item index** (the expensive half of item 03) is deferred to a separate lazily-fetched chunk, and should be built once, shared with item 14 — not twice.

---

## 7. Per-item briefs

Each brief carries verified baselines with `file:line` citations, engine-vs-UI
splits, test plans, i18n keys, design tokens, sync/Dexie impact and open questions.

| Brief                                                                | Items                      |
| -------------------------------------------------------------------- | -------------------------- |
| [A — plan editor](./briefs/A-plan-editor.md)                         | 01, 05, 08, 10             |
| [B — SDE and skills](./briefs/B-sde-skills.md)                       | 03, 04                     |
| [C — overview and multi-character](./briefs/C-overview-multichar.md) | 02, 07, 09                 |
| [E — import and export](./briefs/E-import-export.md)                 | 06, 12                     |
| [F — scopes and activity log](./briefs/F-scopes-activity.md)         | 15a, 15b, 17               |
| [G — new-scope views](./briefs/G-newscope-views.md)                  | 13, 16                     |
| [H — Doctrine Designer](./briefs/H-doctrine.md)                      | 14                         |
| [I — niche tabs](./briefs/I-niche-tabs.md)                           | 20                         |
| [J — shell polish](./briefs/J-shell-polish.md)                       | 11, 18                     |
| [K — library survey](./briefs/K-libraries.md)                        | build-vs-buy, all surfaces |
