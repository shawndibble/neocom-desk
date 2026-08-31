# NeoCom Desk — Architecture Map

For agents locating or adding code. Terms match `CONTEXT.md` — read that first
for glossary (Character, Skill Plan, Build Plan, Remap Marker, etc.).

## 1. System overview

NeoCom Desk is a static SPA (React 19 + TS + Vite) hosted on GitHub Pages —
no app server. Two kinds of data:

- **API-derived** (skills, wallet, assets, mail, ...): pulled live from CCP's
  ESI, cached per-device in Dexie (IndexedDB), never synced.
- **Editable** (Skill Plans, Build Plans, `sync.`-prefixed settings):
  created in-app, synced cross-device via Firebase (Firestore + one Cloud
  Function, `mintFirebaseToken`). Firebase exists _only_ for this sync path —
  it is not a general backend and never sees EVE tokens beyond one
  short-lived access token per sign-in (ADR 0001).

Auth is browser-only OAuth2 PKCE against `login.eveonline.com`; refresh
tokens never leave the device. Market prices come from Fuzzwork aggregates,
ESI as fallback (ADR 0002). The item/skill/blueprint catalog (SDE) is
snapshotted at build time into `public/data/*.json` by `scripts/build-sde.mjs`
— no SDE calls at runtime.

External dependencies: `esi.evetech.net`, `login.eveonline.com`,
`market.fuzzwork.co.uk`, Firebase (Firestore + Functions). Nothing else.

## 2. Module map

| Dir                                                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Must NOT do                                                                                                                          | Imported by                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/app`                                          | Shell: `App.tsx` (routes, root gate, wires `configureEsi` + boot/character-switch sync trigger), `Layout.tsx` (nav), `loginFlow.ts`, `syncStatus.ts`/`SyncStatusDot`/`SyncErrorNote` (sync UI), `ReloadPrompt.tsx` (PWA update prompt)                                                                                                                                                                                                                                                                                                                              | Hold calculation logic                                                                                                               | `main.tsx` only                                                          |
| `src/auth`                                         | Raw EVE SSO: `pkce.ts` (verifier/challenge), `sso.ts` (authorize URL, code/refresh token exchange), `jwt.ts` (decode access token → characterId/name/ownerHash/scopes), `session.ts` (`startLogin`/`completeLogin`/`getValidAccessToken`, single-flight refresh, persists to Dexie)                                                                                                                                                                                                                                                                                 | Talk to Firebase; leak refresh tokens outside Dexie                                                                                  | `app` (login/callback), `sync/syncAuth.ts` (access token for token mint) |
| `src/components/ui`                                | Design-system primitives (`Panel`, `Button`, `StatChip`, `DataAgeBadge`, `EmptyState`, `Tabs`, `Spinner`, `Tooltip`/`InfoTooltip`, `ReauthBanner`) per `docs/DESIGN.md`                                                                                                                                                                                                                                                                                                                                                                                             | Feature logic, direct ESI/Dexie calls                                                                                                | every route/feature                                                      |
| `src/db`                                           | One Dexie instance (`db`), versioned schema: `characters`, `tokens` (refresh tokens, Dexie-only), `settings`, `skillPlans`, `esiCache`, `buildPlans`                                                                                                                                                                                                                                                                                                                                                                                                                | Fetch, business logic                                                                                                                | almost everything                                                        |
| `src/engine` (+ `optimizer`, `industry`, `import`) | **Pure** calculation: `types.ts` (engine-native shapes, decoupled from SDE/ESI), `plan.ts`/`schedule.ts`/`sp.ts` (training-time math), `clipboardExport.ts`/`queueImport.ts`, `optimizer/{bestAttributes,placeRemaps,reorderSuggestion}` (remap placement, reorder), `industry/{buildVsBuy,fees,jobCost,materials,time,types}` (manufacturing math), `import/{eftFit,fitToSkills,skillPlanPaste}` (clipboard parsers)                                                                                                                                               | **No fetch/DOM/Dexie/Firebase imports** (CLAUDE.md rule; TDD required). Callers adapt SDE/ESI shapes to engine types at the boundary | `features/skills`, `features/industry`                                   |
| `src/esi`                                          | `client.ts` (`esiFetch`: token injection via `configureEsi`, `X-Compatibility-Date`/`X-User-Agent`, single 429/420 retry, `EsiError`, `isAuthFailure`), `endpoints.ts` (one typed wrapper per ESI route), `paginated.ts`, `scopes.ts` (read-only `SCOPES` list), `cache.ts` (shared read-through cache: `loadWithCache`/`loadWithCacheStatus`, `GLOBAL_CACHE_CHARACTER_ID`, raw `readCached`/`writeCached` for batch callers)                                                                                                                                       | Hold auth state beyond the injected token provider                                                                                   | every `features/*` data module                                           |
| `src/features/character`                           | Per-view ESI + cache for Wallet/Assets/Mail/Calendar/Contracts/Orders, all thin wrappers over `esi/cache`: `assets.ts`, `calendar.ts`, `contracts.ts`, `mail.ts`, `orders.ts`, `wallet.ts`, `names.ts` (entity name resolution), `typeNames.ts` (item type names), `stations.ts`, `format.ts`                                                                                                                                                                                                                                                                       | Duplicate calculation that belongs in `engine`                                                                                       | `routes/{Wallet,Assets,Mail,Calendar,Contracts,Orders}.tsx`              |
| `src/features/industry`                            | Build Plan feature: `blueprintCatalog.ts`, `data.ts` (owned blueprints + jobs cache), `jobs.ts` (`ActiveJobsPanel` data), `computeBuildPlan.ts` (wires a `BuildPlanRecord` + blueprint + market data into `engine/industry/buildVsBuy`), `marketData.ts`, plus `*.tsx` panel components                                                                                                                                                                                                                                                                             | Reimplement math already in `engine/industry`                                                                                        | `routes/Industry.tsx`                                                    |
| `src/features/skills`                              | Skills feature: `data.ts` (read-through cache: skills/attributes/implants/queue + universe-type), `dogma.ts` (pure ESI `dogma_attributes` parsing — implant bonuses + required-skill pairs), `skillMap.ts`, `typeCatalog.ts`, `typeDisplay.ts`, `clipboard.ts`, `ImplantChip.tsx`, `SkillBar.tsx`, `SkillsSubNav.tsx`. Subdir **`planner/`** (Skill Plan CRUD, `ComputedQueue`, `EntryList`, `PlanEditor`/`PlanList`, `SkillPicker`, `ImportClipboardDialog`/`clipboardImport`, `reorder.ts`, `whatIfImplants.ts`) — **in flight**, two agents editing concurrently | —                                                                                                                                    | `routes/{Skills,SkillPlans}.tsx`                                         |
| `src/features/market`                              | Market Browser support: `search.ts` (`searchTypes` — pure substring search over the SDE `TypeMap`, ranked exact>prefix>substring, capped at 50)                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                    | **in flight** — no route wired in `App.tsx` yet                          |
| `src/i18n`                                         | `index.ts` (i18next init), `locales/en.json` (English-only catalog, wired from day one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Let UI strings bypass i18next (CLAUDE.md rule)                                                                                       | every UI component                                                       |
| `src/lib`                                          | Small pure helpers shared across features with no other natural home: `duration.ts` (`formatDuration`, "Xd Yh Zm"), `cap.ts` (`Capped<T>`/`capItems`, the truncation-signal shape for a fetch or render cap)                                                                                                                                                                                                                                                                                                                                                        | Feature-specific logic (that belongs in the feature or `engine`)                                                                     | `features/industry`, `features/skills/planner`                           |
| `src/market`                                       | `hubs.ts` (`TRADE_HUBS`, `DEFAULT_TRADE_HUB`: Jita/Amarr/Dodixie/Rens/Hek per CONTEXT.md), `fuzzwork.ts` (primary price source, ADR 0002), `esiPrices.ts` (ESI fallback), `prices.ts` (adapter), `cost-index.ts` (system manufacturing cost index)                                                                                                                                                                                                                                                                                                                  | DOM/UI                                                                                                                               | `features/industry`, `routes/Industry.tsx`, future Market Browser        |
| `src/routes`                                       | One file per page: `Login`, `Callback`, `Characters`, `Overview` (+ `overviewQueue.ts`), `Skills`, `SkillPlans`, `Industry`, `Wallet`, `Assets`, `Mail`, `Calendar`, `Contracts`, `Orders`, `Styleguide`                                                                                                                                                                                                                                                                                                                                                            | Own reusable logic other routes need — push into `features`/`engine`                                                                 | `app/App.tsx` (route table) only                                         |
| `src/sde`                                          | `loadSde.ts` (fetch+memoize `public/data/{skills,blueprints,types}.json`, built by `scripts/build-sde.mjs`), `types.ts` (`SkillType`, `BlueprintMap`, `TypeMap`)                                                                                                                                                                                                                                                                                                                                                                                                    | Make ESI calls                                                                                                                       | `features/skills`, `features/industry`, `features/market`                |
| `src/stores`                                       | Zustand stores: `activeCharacter.ts` (persisted via Dexie `settings`, `hydrate`/`setActiveCharacter`), `publicInfo.ts` (session-only corp/alliance name cache, not durable)                                                                                                                                                                                                                                                                                                                                                                                         | Persist editable data outside `src/db`/sync                                                                                          | `app`, `routes/Characters.tsx`                                           |
| `src/styles`                                       | `index.css` — Tailwind v4 `@theme` tokens per `docs/DESIGN.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Component logic                                                                                                                      | build pipeline                                                           |
| `src/sync`                                         | `index.ts` (public barrel — **import from `@/sync` only**), `planSync.ts` (driver: `triggerSync`/`scheduleSync`/status/`markPlanDeleted`/`markBuildPlanDeleted`/`setSyncedSetting`/`deleteSyncedSetting`), `merge.ts` (pure LWW+tombstone merge, no Firebase import, unit-testable), `syncedSettings.ts` (`SYNCED_SETTING_KEYS` allow-list + pinned test), `syncAuth.ts` (`ensureSignedIn` → `mintFirebaseToken` exchange), `firebaseApp.ts` (lazy Firebase app/auth/firestore/functions getters)                                                                   | UI wiring (owned by `src/app`)                                                                                                       | `app/App.tsx`, `routes/Industry.tsx`, `features/skills/planner`          |

## 3. Data flows

**SSO login (PKCE)**
`app/loginFlow.beginEveLogin` → `auth/session.startLogin` stashes PKCE
verifier+state in `sessionStorage`, redirects to `login.eveonline.com` →
`routes/Callback.tsx` → `auth/session.completeLogin` validates state,
exchanges code, decodes the JWT (`auth/jwt`), writes `CharacterRecord` +
`TokenRecord` (refresh token) to Dexie. Later ESI calls go through
`auth/session.getValidAccessToken` (single-flight refresh, buffer 60s before
expiry) → `esi/client.configureEsi`'s injected `getToken`.

**ESI read-through cache**
Pattern: try live `esiFetch` → on success, write `db.esiCache` (keyed
`[characterId, key]`, or `GLOBAL_CACHE_CHARACTER_ID` for character-independent
lookups like universe types/names) → on failure, fall back to cache; `null`
only when neither exists. Auth failures (401/403/refresh failure) surface as
`needsReauth: true` instead of silently going stale. Implemented once, in
`esi/cache.ts` (`loadWithCache`/`loadWithCacheStatus`, `isAuthFailure` from
`esi/client.ts`) — every `features/*` data module (`skills/data.ts`,
`character/{wallet,assets,mail,calendar,contracts,orders,stations}.ts`,
`industry/data.ts`, `industry/jobs.ts`) is a thin wrapper over it.
`loadWithCacheStatus` takes `detectAuthFailure`/`skipCacheOnAuthFailure`
options for `industry/jobs.ts`'s narrower definition (only a 403, and no
cache fallback — a character that never granted the scope has never cached
a jobs response). `features/character/{names,typeNames}.ts` do their own
batch/partial-resolution instead of a single-key read-through, so they only
share the raw `readCached`/`writeCached` primitives and the
`GLOBAL_CACHE_CHARACTER_ID` sentinel, not `loadWithCache` itself.

**Skill plan edit → sync**
UI mutates `db.skillPlans`/`db.buildPlans`/`setSyncedSetting` directly, then
calls `scheduleSync(characterId)` (2s debounce) or `triggerSync` for
immediate. Deletes MUST go through `markPlanDeleted`/`markBuildPlanDeleted`
/`deleteSyncedSetting` (each records a tombstone) — a plain Dexie delete
resurrects from the remote copy. `setSyncedSetting` also enforces the
`SYNCED_SETTING_KEYS` allow-list (`src/sync/syncedSettings.ts`); adding a
synced setting is a deliberate two-file edit (list + its pinned test).
`triggerSync` → `syncAuth.ensureSignedIn` (mints a Firebase custom token from
the current EVE access token, uid `char:{characterId}`, claim `ownerHash`) →
per collection: fetch remote docs filtered `where(ownerHash==current)` →
`merge.mergeRecords`/`merge.mergeSettings` (last-write-wins by `updatedAt`;
remote tombstones kept 30 days, local settings tombstones until the key is
rewritten) → push/pull/delete accordingly. Syncs are globally serialized (one Firebase
session, swapped on character switch) and coalesced per character. If a
character's `ownerHash` changed since the last sync (sold/transferred), local
plans for it are wiped first (`handleOwnerHashChange`).

**Industry build plan compute**
`routes/Industry.tsx` loads blueprint catalog + owned blueprints + character
skills, renders `BuildPlanDetail` → `features/industry/computeBuildPlan`
clamps user inputs (runs/ME/TE) into valid ranges, resolves the
`FacilityPreset` (NPC station or Raitaru/Azbel/Sotiyo + rig level), and calls
pure `engine/industry/buildVsBuy` with system cost index + adjusted prices +
hub prices + skill levels → `BuildResult` (materials, job fee breakdown,
build-vs-buy verdict). Never throws — computation errors surface as
`{ result: null, error }`.

**SDE build-time pipeline**
`scripts/build-sde.mjs` downloads Fuzzwork SDE CSVs (`invTypes`, `invGroups`,
`dgmTypeAttributes`, `industryActivity*`) into a gitignored repo-local cache,
emits slim `public/data/{skills,blueprints,types}.json`. Runtime never fetches
CSVs — `src/sde/loadSde.ts` fetches+memoizes the built JSON once per session.

## 4. Invariants & gotchas

- Refresh tokens live in Dexie **only** — never Firebase, never logs (ADR 0001).
- ESI attributes (`getCharacterAttributes`) already include implant bonuses;
  subtract `features/skills/dogma.extractAttributeBonuses` output to get base
  attributes for the engine.
- Required-skill dogma attribute pairing (verified against everef.net + a live
  ESI response, **the commonly-assumed pairing is backwards**):
  requiredSkill5 (1289) pairs with **1287** (not 1288); requiredSkill6 (1290)
  pairs with **1288** (not 1287). See `features/skills/dogma.ts` header.
- Firestore rules split `get`/`update` (hash-strict — `ownerHash` must match
  the token claim) from `list` (uid-only). A hash-strict `list` would fail
  every query the moment one stale-owner doc exists; the client always scopes
  `list` queries with `where('ownerHash', '==', current)` to compensate.
- `esi/client.COMPATIBILITY_DATE` is a pinned constant (`X-Compatibility-Date`
  header) — bump deliberately, not silently, when adopting a newer ESI
  contract.
- Dev server port 5173 is `strictPort: true` — the EVE SSO callback URL must
  match exactly; never let Vite fall back to another port. E2E runs its own
  server on 5199 instead of sharing 5173.
- `playwright.config.ts` blanks `VITE_FIREBASE_*` env for e2e so
  `isSyncConfigured()` is false — otherwise `triggerSync` would hit the real
  Cloud Function and trip the e2e network guard (`e2e/support/testBase.ts`
  aborts any request to a non-baseURL host).
- Adding an ESI scope requires re-login UX: a token with the old scope set
  can't call the new endpoint (403) until the user re-authorizes — see
  `components/ui/ReauthBanner` and `isAuthFailure`/`needsReauth` handling.
- `POST /universe/names` rejects the **whole batch** with 404 if even one id
  is unresolvable (undocumented in the OpenAPI spec, reproducible in
  practice). `features/character/typeNames.ts` falls back to per-id
  `GET /universe/types/{id}` (concurrency-capped at 10) on that 404.

## 5. Test layout

- **Unit**: Vitest, colocated (`Foo.ts` + `Foo.test.ts` in the same dir),
  jsdom environment. `engine/*` and `auth/*` are TDD-required (CLAUDE.md):
  failing test first.
- **Functions**: `functions/` has its own package.json + Vitest suite
  (`functions/src/*.test.ts`); run via `npm --prefix functions test`.
- **E2E**: Playwright (`e2e/*.spec.ts`), fully mocked — `e2e/support/mockSso.ts`
  - `mockEsi.ts` intercept every external call, and `testBase.ts` installs a
    network guard that **fails the test** if anything escapes to a real host.
    Runs its own dev server on port 5199 with blanked Firebase env (see §4).

Validate before commit: `npm run lint && npm run typecheck && npm run test:run`.
Full E2E: `npm run test:e2e`. SDE rebuild: `npm run sde:build`.

## 6. Feature inventory

| Route                                         | Feature                                                                                                                                 | Status                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/callback`                         | EVE SSO (PKCE)                                                                                                                          | shipped                                                                                                                                  |
| `/characters`                                 | Character switcher, public info                                                                                                         | shipped                                                                                                                                  |
| `/overview`                                   | Per-character summary + training queue                                                                                                  | shipped                                                                                                                                  |
| `/skills`                                     | Trained skills, attributes, implants, in-game queue                                                                                     | shipped                                                                                                                                  |
| `/skills/plans`                               | Skill Plans: editor, computed queue, clipboard import/export, optimizer (remap placement, reorder suggestion), what-if implants/booster | shipped; **Remap Markers** (user-placed drag markers, CONTEXT.md round 2) **in flight** — no `Marker` implementation found in `src/` yet |
| `/industry`                                   | Build Plans: blueprint search, materials/fees/build-vs-buy, facility presets, active jobs panel                                         | shipped                                                                                                                                  |
| `/wallet`                                     | Balance, journal, transactions                                                                                                          | shipped                                                                                                                                  |
| `/assets`                                     | Asset list (container labels partially unresolved — see UX review §5)                                                                   | shipped                                                                                                                                  |
| `/mail`, `/calendar`, `/contracts`, `/orders` | Character views                                                                                                                         | shipped                                                                                                                                  |
| —                                             | **Market Browser** (general item price lookup, CONTEXT.md round 3)                                                                      | **in flight** — `features/market/search.ts` exists, no route in `App.tsx`                                                                |
| `/styleguide`                                 | Hidden design-system reference                                                                                                          | shipped (dev aid)                                                                                                                        |

## 7. Adding a new ESI-backed view

1. Add the ESI endpoint wrapper to `src/esi/endpoints.ts` (typed request/response, follows existing wrapper shape).
2. Add any new scope to `src/esi/scopes.ts` — remember this forces a re-login UX for existing users (§4).
3. Add a per-view data module under `src/features/<area>/` that wraps `esi/cache.loadWithCache`/`loadWithCacheStatus` (see §3) — don't hand-roll another read-through loop.
4. If the view needs calculation, add it to `src/engine/` test-first (pure, no fetch/DOM/Dexie).
5. Add the Dexie schema bump in `src/db/index.ts` only if new local storage is needed (additive `db.version(n+1).stores({...})`, never mutate a shipped version).
6. Build the route component in `src/routes/`, composing `components/ui` primitives (`Panel`, `DataAgeBadge` — required on every ESI-backed view, `EmptyState`, `Spinner`).
7. Wire the route into `src/app/App.tsx` and add nav entry (`Layout.tsx`).
8. Add strings to `src/i18n/locales/en.json`; colocated unit tests; e2e mock additions in `e2e/support/mockEsi.ts` if the view needs e2e coverage.
