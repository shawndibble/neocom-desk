# EveLens parity — implementation plan

Source: the "EveLens vs NeoCom Desk" competitive teardown, items 01–18 and 20
(item 19, second language, is explicitly excluded — it waits for a stable
English UI).

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
  behaviour this approach was chosen to avoid. Outstanding, not done.

The whole app also moved behind authentication (see `CONTEXT.md` round 4),
which removes the anonymous-state branch from the gate entirely.

### Current measurements

- **JS bundle: 334 KB gzip**, single chunk. `firebase/firestore` alone is 109 KB of it (32%).
- **`public/data/` SDE payload: 2.29 MB** (blueprints 1.46 MB, types 0.73 MB, skills 0.11 MB) — already shipped to every user, and the budget items 03/04/16 draw against.
- 91 colocated unit test files; 4 Playwright specs.

---

## 2. Defects found during investigation

These are not teardown items. They are existing bugs the passes surfaced, and
several block or distort the features above them.

| #   | Defect                                                                                                                                                                                                                              | Evidence                                                                         | Severity                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | `handleOwnerHashChange` wipes Skill Plans when a Character is sold but leaves the **previous owner's cached wallet, mail and assets** in `esiCache`                                                                                 | `sync/planSync.ts:253-263`                                                       | Privacy                                                                                |
| D2  | Granted scopes are persisted on `TokenRecord` and **never read by anything** — scope-revoke detection has nothing behind it                                                                                                         | `db/index.ts:22`, written `auth/session.ts:68`                                   | Privacy                                                                                |
| D3  | `ReauthBanner` is wired into **3 of 9** ESI-backed views. Assets, Mail, Calendar, Contracts, Orders and Overview discard `needsReauth` and render as merely empty                                                                   | `components/ui/ReauthBanner.tsx` consumers                                       | Correctness                                                                            |
| D4  | `paginated.ts` silently returns truncated data as complete, with a fresh `DataAgeBadge` and no signal anywhere                                                                                                                      | `esi/paginated.ts:19-26`                                                         | Correctness                                                                            |
| D5  | `placeRemaps` is O(R²) synchronous on the main thread: **624 ms at 46 attribute-pair runs, 3.1 s at 91, 9.0 s at 145**. The docstring claims it keeps "~200-step plans fast"                                                        | `engine/optimizer/placeRemaps.ts:18,120-170`                                     | Performance                                                                            |
| D6  | The optimizer ignores Boosters by design while the computed queue applies them — invisible today only because they render in separate panels. **Ruled §5.5: teach the optimizer (option b); a long Booster covers weeks of a plan** | `engine/optimizer/bestAttributes.ts:7` vs `planner/PlanEditor.tsx:92-96`         | Correctness — a wrong optimum, not just an undisclosed one. Engine change, gated on D5 |
| D7  | `dedupeEntries` rebuilds bare entry objects, so any new `PlanEntry` field is silently dropped on reorder                                                                                                                            | `planner/reorder.ts:33`                                                          | Latent                                                                                 |
| D8  | Two `role="dialog" aria-modal="true"` declarations on plain `<div>`s — no focus containment, no inert background                                                                                                                    | `planner/ImportClipboardDialog.tsx:61`, `app/Layout.tsx:60`                      | Accessibility                                                                          |
| D9  | The scope list has three hand-maintained copies and has already drifted — `e2e/support/fixtureData.ts:21-31` is missing `esi-industry.read_character_jobs.v1`                                                                       | —                                                                                | Maintainability                                                                        |
| D10 | `formatIsk` is implemented three times; only the `character` copy has the float-noise epsilon clamp, so the other two can render `-0`                                                                                               | `features/character/format.ts:21`, `industry/format.ts:8`, `market/format.ts:14` | Maintainability                                                                        |
| D11 | Assets fetches every page and renders all of it uncapped                                                                                                                                                                            | `esi/paginated.ts` + `routes/Assets.tsx:164,167`                                 | Performance                                                                            |
| D12 | `/assets` renders every player structure as `Structure #{{id}}`                                                                                                                                                                     | `routes/Assets.tsx:41`, `i18n/locales/en.json:300`                               | UX — fixed for free by the Phase 3 scope batch                                         |

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

**The survey's most valuable finding is unrelated to the features.** The repo
imports eight Firestore symbols, all of which exist in
`firebase/firestore/lite`; `onSnapshot` has zero matches repo-wide. Aliasing
to `lite` and deferring the static `@/sync` import at `app/App.tsx:7` takes
the bundle from **334 KB to ~175 KB gzip**. Measured by building the repo
twice with a `manualChunks` overlay applied from a scratch Vite config
(`outDir` redirected outside the repo), once against `firebase/firestore` and
once against `firebase/firestore/lite` — reproduce it the same way rather
than trusting the figure.

---

## 4. Build order

Cost labels follow the teardown: **S** = a few days, **M** = a week or two,
**L** = a milestone. Costs below are the _revised_ figures from investigation,
not the teardown's originals.

### Phase 0 — Foundation (no user-visible features)

Everything here unblocks something downstream or is a free win. None of it is
a teardown item, which is exactly why the teardown's ranking couldn't surface it.

| Task                                                                                                                                    | Cost | Unblocks                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------- |
| Firestore `lite` alias + lazy `@/sync` import (334 → ~175 KB)                                                                           | S    | Everything — pure win                               |
| Fix `docs/ARCHITECTURE.md` §6 and `docs/DESIGN.md` §4                                                                                   | S    | Any future planning                                 |
| **Endpoint registry**: one table mapping ESI endpoint → required scope → route template                                                 | S    | 15a, 17, D9                                         |
| Fix D1 — purge `esiCache` on owner-hash change. Start reading the stored scope set (D2)                                                 | S    | Privacy; supplies 15a's detection input             |
| Central auth gate + route scope gate, replacing per-view `ReauthBanner` wiring (D3)                                                     | S    | 13, 15b, 16, 20                                     |
| Signal truncation in `paginated.ts` (D4)                                                                                                | S    | 17, 20                                              |
| `placeRemaps` single-remap O(R) path (D5)                                                                                               | S    | **05** — and speeds up the shipped optimizer button |
| ~~Decide Booster semantics (D6)~~ **Decided §5.5 — teach the optimizer.** The build is now engine work, sized **M**, sequenced after D5 | M    | 01, 05                                              |
| `<dialog>` / Popover API migration (D8)                                                                                                 | S    | 10, 15b, 17                                         |
| px→rem sweep, 40 arbitrary `text-[11px]`/`text-[10px]` sites                                                                            | S    | **18**                                              |
| Promote `SkillBar` to `components/ui`; dedupe `formatIsk` (D10)                                                                         | S    | Consistency                                         |

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
esi-characters.read_contacts.v1        item 20   if contacts is in the batch
esi-characters.read_loyalty.v1         item 20   if loyalty points is in the batch
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

| Item | Feature                       | Cost | Notes                                                                                                                                  |
| ---- | ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 15a  | Cache purge on scope revoke   | S    | Ships **before** the batch. Blunt purge of character-scoped rows first; `GLOBAL_CACHE_CHARACTER_ID` rows are public and must be spared |
| 13   | Clone and implant tab         | M    | Jump cooldown is `24h − 1h/level`, floor 19h — pure math, `src/engine/clones.ts`, TDD, `nowMs` injected                                |
| 16   | Planetary industry            | M    | Revised **down from L**. SDE delta measured by building it: **+20 KB on 2.29 MB (+0.9%)**                                              |
| 20   | Niche tabs — first batch only | S–M  | Employment history, contacts, loyalty points. Defer the rest; **defer notifications and kill log indefinitely**                        |
| 15b  | Scope picker at login         | M    | Ships **after** the batch. Strictly local, never a `sync.` setting — a synced value would contradict the device's actual token grant   |

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

1. **Sync scope (blocks items 07 and 09).** Firebase uid is `char:{characterId}` — sync is **per Character, not per user**. A "synced setting" only reaches devices that have activated that same Character. CONTEXT.md's **Account** concept has no storage representation. Options: (a) accept per-Character duplication and document the caveat — keeps 09 at M; (b) build real account-level sync — pushes 09 to L. Additionally, `mergeSettings` has **no tombstones**, so deleted keys resurrect from remote: saved comparisons and groupings must be stored as one array-valued key, never one key per item.
2. **The PI consent string.** `esi-planets.manage_planets.v1` is read-only in practice — it grants only two GETs in the current surface — but the SSO consent screen will read _"manage your planetary installations"_ to users of an app that advertises itself as read-only (CONTEXT.md, "Read-only: no ESI write scopes"). Product call.
3. **Item 05's badge at `remapCount ≥ 2`.** The O(R) exact path covers the single-remap default. Multi-remap plans need either a slower exact pass or an honest "not evaluated" state. Pick one — a badge with two reachable states instead of three is worse than no badge.
4. **Which niche tabs (item 20).** Recommended first batch: employment history (free), contacts, loyalty points. Recommended never: notifications (the `text` field is raw YAML needing per-type templates for 150+ types, sourced from neither ESI nor the SDE) and kill log (link zKillboard instead).
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

   **`placeRemaps` threading is done, and it exposed a cliff.** Both placement
   paths are Booster-aware, so the answer cannot change with `remapCount` (a
   0..5 user input). The DP stays valid because segment cost is monotonically
   non-decreasing in start time — a later start can only mean less Booster — so
   the minimal prefix is still the best prefix to extend. Costs are resolved
   lazily against `dp[k-1][i]`, because the sp-per-pair signature is no longer a
   sufficient memo key once cost depends on when a segment starts.

   Measured at 200 steps with a 24-day Booster:

   | `remapCount` | Booster-blind | Booster-aware |
   | ------------ | ------------- | ------------- |
   | 1            | 62 ms         | **81 ms**     |
   | 5            | 2.2 s         | **21.7 s**    |

   The single-remap scan is effectively free. The DP is not: it evaluates a
   segment per `(k, i, j)` and only the signature memo made that affordable.

   **So the UI is not wired yet, and must not be while `remapCount >= 2` is
   reachable.** The fix shape is known: for a fixed `(k, i)` every `j` shares
   one boosted prefix, so a single pass over allocations can cost all `j` at
   once instead of R separate calls. This interacts with **D5**, which already
   had this path at 2.2 s Booster-free, and with §5 decision 3, which is the
   user's to make.

   Useful context for that decision: a 24-day Booster covers the first **5
   steps (3%)** of a 200-step plan, because such a plan runs ~1,100 days.

   Binding on items 01 and 05: they render one number, computed one way. The
   "excludes booster" note option (a) called for must not ship.

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

P1 and P2 shipped together. P4 is requested and waits on §5.5. P3 was not
requested and is the largest — recorded, not scheduled.

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
