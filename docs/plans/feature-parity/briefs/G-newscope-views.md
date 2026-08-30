# G — New ESI-backed views: Clone/implant tab (13) + Planetary industry (16)

Investigation only. Repo read-only. Verified against `main` source and against
CCP primary sources (see "Primary sources checked" at the end).

---

# ⚠ CROSS-CUTTING — READ FIRST: the batched re-auth

A scope is added by adding an entry to `ESI_REGISTRY` in `src/esi/registry.ts` for the new
endpoint wrapper — **never by hand-editing `src/esi/scopes.ts`**. `scopes.ts`'s `SCOPES` (and
`SCOPES_STRING`) are derived from `ESI_REGISTRY`, not hand-maintained; editing them directly would
be immediately overwritten in spirit and drift from the registry that `e2e/support/fixtureData.ts`
and `app/routeScopes.ts` also derive from. Adding a registry entry with a new scope changes
`SCOPES_STRING`, which changes the SSO authorize URL. Every existing token was minted with the
old scope set, so **every character must log in again** before any new endpoint stops 403-ing
(`docs/ARCHITECTURE.md` §4; the concrete pattern is already in the codebase for
`esi-industry.read_character_jobs.v1` — `src/features/industry/jobs.ts`, `loadCharacterIndustryJobs`).
Items 13, 16 and 20 must ship their scope additions as **one** `registry.ts` edit (one new entry
per new endpoint wrapper) and one re-auth prompt.

## EXACT SCOPE STRINGS — merge these into the single batch

```
esi-clones.read_clones.v1              Item 13  REQUIRED
esi-planets.manage_planets.v1          Item 16  REQUIRED
esi-universe.read_structures.v1        Item 13  STRONGLY RECOMMENDED (see below)
```

Nothing else. Verified by mapping every `security.OAuth2` entry in
`https://esi.evetech.net/meta/openapi.json` (fetched 2026-08-29) to its paths:

| Scope                             | Grants exactly                                                             |
| --------------------------------- | -------------------------------------------------------------------------- |
| `esi-clones.read_clones.v1`       | `GET /characters/{id}/clones`                                              |
| `esi-planets.manage_planets.v1`   | `GET /characters/{id}/planets`, `GET /characters/{id}/planets/{planet_id}` |
| `esi-universe.read_structures.v1` | `GET /universe/structures/{structure_id}`                                  |

### Why `esi-universe.read_structures.v1` is worth putting in the batch

It is not only for Item 13. It also repairs a **shipped** view: `/assets`
currently renders every player structure as a literal `Structure #{{id}}`
(`src/i18n/locales/en.json:300`, used at `src/routes/Assets.tsx:41`), because
`src/features/character/stations.ts:1-6` deliberately handles NPC stations only.
A scope that fixes existing UI is a much easier sell inside a batched re-auth
than one that only unlocks new tabs. Recommend including it; Item 13 degrades
gracefully without it (see §13 "Location names").

### Honesty flag on `esi-planets.manage_planets.v1`

CCP named it `manage_planets`, but in the current ESI surface it grants **two
GETs and no writes** (verified above; the spec does contain `post`/`put`/`delete`
operations, none of them under this scope). Technically it does not violate
CONTEXT.md's "Read-only: no ESI write scopes". **However** the EVE SSO consent
screen will render it as roughly "manage your planetary installations" to a user
of an app that advertises itself as read-only. That is a trust/UX decision for
the orchestrator, not a technical blocker — but it should be a deliberate one,
and the re-auth copy should pre-empt it.

## Data available WITHOUT any new scope (ships with no re-auth prompt)

| Endpoint                                  | Public?                                                                                                                  | Used for                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET /characters/{id}/implants`           | scope `esi-clones.read_implants.v1` — **already granted** (`ESI_REGISTRY.getCharacterImplants` in `src/esi/registry.ts`) | Item 13's active-clone implant half                                                                    |
| `GET /universe/planets/{planet_id}`       | **public, no scope**                                                                                                     | Planet name + system_id + type_id for PI colonies                                                      |
| `GET /universe/systems/{system_id}`       | **public, no scope**                                                                                                     | Solar-system name (alternative: `POST /universe/names`, already wrapped at `src/esi/endpoints.ts:435`) |
| `GET /universe/stations/{station_id}`     | **public, no scope** — already wrapped (`endpoints.ts:348`)                                                              | NPC-station clone locations                                                                            |
| `GET /universe/schematics/{schematic_id}` | **public, no scope**                                                                                                     | PI factory schematic — **but insufficient**, see below                                                 |
| `GET /universe/types/{type_id}`           | **public, no scope** — already wrapped (`endpoints.ts:210`)                                                              | Item names/icons/descriptions                                                                          |

Two traps worth stating up front:

- **`/universe/schematics/{id}` returns only `{schematic_name, cycle_time}`** —
  no inputs, no outputs, no quantities (verified: schema
  `UniverseSchematicsSchematicIdGet`). That single fact is why Item 16 has an SDE
  dependency at all.
- **`POST /universe/names` has no `planet` category** (enum verified:
  alliance, character, constellation, corporation, inventory_type, region,
  solar_system, station, faction). Planet names must come from the per-planet
  public GET; they cannot be batch-resolved.

`src/esi/client.ts:11` `COMPATIBILITY_DATE = '2026-08-01'` needs **no bump**:
every new path reports `x-compatibility-date: 2020-01-01`.

---

## Item 13 — Clone and implant tab

**Artifact claim:** "Closest missing tab. We already read implants; clones need
`esi-clones.read_clones.v1`, which forces every character to log in again. Batch
it with any other new scope."

**Verdict:** CONFIRMED — every clause checks out. Implants are read today under
`esi-clones.read_implants.v1` (`ESI_REGISTRY.getCharacterImplants` in `src/esi/registry.ts`); the clones endpoint needs
exactly `esi-clones.read_clones.v1` (spec-verified); and the re-auth cost is real
(`docs/ARCHITECTURE.md:135`). One addition the teardown misses: **clone
_locations_ need a second scope** to be human-readable.

### Verified baseline (implant half)

- `GET /characters/{id}/implants` wrapper: `src/esi/endpoints.ts:90-101`
  (`getCharacterImplants`, returns `number[]` — bare implant type IDs; spec
  schema `CharactersCharacterIdImplantsGet` is `array of int64`, confirming the
  wrapper is correct).
- Scope: `esi-clones.read_implants.v1`, declared on `ESI_REGISTRY.getCharacterImplants`
  (`src/esi/registry.ts`). Already granted by every existing character.
- Read-through cache wrapper: `src/features/skills/data.ts:74-80`
  (`loadCharacterImplants`, cache key `'implants'` from `data.ts:32`), plus
  `loadUniverseType` at `data.ts:94-100` keyed `type:{typeId}` under
  `GLOBAL_CACHE_CHARACTER_ID`.
- Dogma parsing: `src/features/skills/dogma.ts:46-56` `extractAttributeBonuses`
  (attribute IDs 175-179 → charisma/intelligence/memory/perception/willpower,
  `dogma.ts:23-29`), summed by `dogma.ts:59-68` `sumAttributeBonuses`. Aggregated
  for the engine at `data.ts:108-113` `loadImplantBonuses`.
- UI today: **active clone only**, an implant chip row on the Skills page —
  `src/routes/Skills.tsx:237-253`, using `src/features/skills/ImplantChip.tsx`
  (icon + name + description tooltip). Attribute display subtracts implant
  bonuses to show base values (`Skills.tsx:216-218`).

So: exactly what the claim says — `/characters/{id}/implants` only, active clone
only, scope already held.

### Verified baseline (clone half)

Nothing. `grep -rni "clone jump|jumpclone|infomorph" src/ docs/ CONTEXT.md`
returns **zero hits**. No endpoint wrapper, no scope, no data module, no route.

### The clones endpoint — spec-verified shape

`GET /characters/{character_id}/clones`, scope `esi-clones.read_clones.v1`,
`x-cache-age: 120`, rate-limit group `char-location` (1200 tokens / 15m).
Schema `CharactersCharacterIdClonesGet`:

```
{
  home_location?: { location_id?: int64, location_type?: 'station'|'structure' },
  jump_clones: [                       // REQUIRED (the only required key)
    { jump_clone_id: int64,            // required
      location_id:   int64,            // required
      location_type: 'station'|'structure',  // required
      implants:      int64[],          // required
      name?:         string }
  ],
  last_clone_jump_date?:     date-time,
  last_station_change_date?: date-time
}
```

**Optionality matters and is easy to get wrong.** `home_location`,
`last_clone_jump_date`, `last_station_change_date` and per-clone `name` are all
_outside_ the `required` list. A character who has never clone-jumped has no
`last_clone_jump_date` → the cooldown is "ready", not "invalid". Type these as
optional and test the absent case.

Note `jump_clones[].implants` gives implants **per jump clone** directly — no
extra call. Only `/universe/types/{id}` per distinct implant type is needed for
names/icons, and `data.ts:94-100` already does that with global caching, so
implants shared across clones cost one lookup total.

### Gap

1. No `getCharacterClones` wrapper.
2. No `esi-clones.read_clones.v1` scope.
3. No jump-cooldown math anywhere.
4. No structure-name resolution (`stations.ts` is NPC-station-only).
5. No route/nav entry; implants live buried in the Skills page.

### Jump cooldown — yes, it is a calculation, and it belongs in `src/engine`

Primary-source verified two ways:

- SDE `invTypes` description for **Infomorph Synchronizing (typeID 33399)**:
  _"Reduced time between clone jumps by 1 hour per level."_
- EVE University wiki _Jump clone_: _"Jumping is instantaneous but incurs a
  24-hour cooldown timer before your next clone jump"_; _"Training Infomorph
  Synchronizing cuts this cooldown by 1 hour per skill level"_; minimum at
  level V is **19 hours**.

So: `cooldownHours = 24 - min(infomorphSynchronizingLevel, 5)`, floor 19.

Related but distinct (surface as a stat, not a timer): **max jump clones** =
Infomorph Psychology (24242, "Allows 1 jump clone per level") + Advanced
Infomorph Psychology (33407, "Allows 1 additional jump clone per level").

**Engine vs feature — a real decision, not a default.** There is a live
precedent cutting the other way: `src/features/industry/jobs.ts:36-71` keeps pure
view helpers (`jobProgress`, `isJobDone`, `isCompletingSoon`) in the _feature_
module with colocated tests, not in `engine`. **Recommendation: put this in
`src/engine`** anyway, because unlike `jobProgress` it takes a _skill level_ as
input — that is EVE domain math (the same category as `engine/sp.ts` or
`engine/industry/time.ts`), not view formatting. Flagging the precedent so the
orchestrator sees it was a choice.

**Clock purity:** match the established convention exactly — `nowMs` is a
parameter, never `Date.now()` inside the pure function, exactly as
`jobs.ts:44` `jobProgress(job, nowMs)` and `jobs.ts:55` `isJobDone(job, nowMs)`
do. The route passes `Date.now()` in.

### Location names — the failure mode, and the trap

`src/features/character/stations.ts:15-22` `loadStationName` calls
`GET /universe/stations/{id}` (public). Its own header comment
(`stations.ts:1-6`) says explicitly: _"Player structures need an auth scope this
app doesn't request … callers show 'Structure #id' for those instead of calling
this loader."_ Its test asserts the null case at `stations.test.ts:38`. So:
**structures are not resolved today, by design.**

Clone locations are `location_type: 'station' | 'structure'`. NPC stations
resolve today for free. Structures need
`GET /universe/structures/{structure_id}` + `esi-universe.read_structures.v1`.

**⚠ THE TRAP — do not wire this naively.** The ESI spec's own description for
that path reads: _"Returns information on requested structure if you are on the
ACL. Otherwise, returns 'Forbidden' for all inputs."_ A **403 here is a normal,
expected outcome** for a character not on that structure's access list — even
when the token holds the scope. But `src/esi/client.ts:63` `isAuthFailure`
returns true for **any** 403, and that is `loadWithCacheStatus`'s default
(`src/esi/cache.ts:70`). Wire it naively and every clone parked in an
inaccessible Astrahus fires `ReauthBanner`, telling the user to log in again —
forever, with no re-login able to fix it.

**Specification:** the structure loader must pass a `detectAuthFailure` override
that **never** treats 403 as reauth — the exact inverse of the `jobs.ts:29-32`
override (which treats _only_ 403 as reauth). Concretely:

```ts
detectAuthFailure: (err) =>
  err instanceof AuthError || (err instanceof EsiError && err.status === 401),
```

i.e. keep 401 (bad/expired token — a genuine reauth) and keep `AuthError`
(refresh itself failed), but **drop 403**, which falls through to the
cache/`null` branch. Do not shorten this to `err instanceof AuthError` alone;
that would silently swallow real 401s.

**UI degradation ladder** (per clone row):

1. Live/cached structure name → show it.
2. 403 / offline / uncached → show `Structure #{{id}}` — reuse the existing
   `en.json:300` string pattern (see `Assets.tsx:41`).
3. Never show a reauth banner from a structure lookup. Never block the row: the
   clone's implants and the cooldown timer are the point; the name is a nicety.

### Engine vs UI split

| Layer                                           | Contents                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/clones.ts` (**TDD-required**, pure) | `jumpCooldownSeconds(level)`, `cloneJumpReadyAt(lastJumpIso, level)`, `cloneJumpRemainingSeconds(lastJumpIso, level, nowMs)`, `maxJumpClones(ipLevel, aipLevel)`. No fetch/DOM/Dexie.                                                                                                                                                                                       |
| `src/features/character/clones.ts`              | `loadCharacterClones` — `loadWithCacheStatus` wrapper, cache key `'clones'`, using the **`jobs.ts:29-32` policy** (`detectAuthFailure`: 403 only, `skipCacheOnAuthFailure: true`). Same situation as industry jobs: a scope added after existing logins, so a character that never granted it has never cached a clones response and there is nothing useful to degrade to. |
| `src/features/character/structures.ts`          | `loadStructureName` — public-ish structure resolver with the 403-is-not-reauth override + `Structure #id` degrade.                                                                                                                                                                                                                                                          |
| `src/routes/Clones.tsx`                         | Composition only: home clone, active clone (implants moved/mirrored from `Skills.tsx:237-253`), jump clone cards, cooldown timer, `DataAgeBadge`.                                                                                                                                                                                                                           |

### Files touched

- `src/esi/registry.ts` — the `ESI_REGISTRY` entries for `getCharacterClones` (scope
  `esi-clones.read_clones.v1`) and, if batched, `getUniverseStructure` (scope
  `esi-universe.read_structures.v1`) carry the new scopes; `src/esi/scopes.ts`'s `SCOPES` picks
  them up automatically, no edit needed there. **Batch with items 16/20.**
- `src/esi/endpoints.ts` — add `getCharacterClones` + `CharacterClones` types; add
  `getUniverseStructure` + `UniverseStructure` (`{name, owner_id, solar_system_id, type_id?,
position?}`; `name`/`solar_system_id`/`owner_id` required). **Each new wrapper must land with
  both** a `// --- METHOD /route (scope) ---` marker comment above it and a matching entry in
  `ESI_REGISTRY` (`src/esi/registry.ts`): `ESI_REGISTRY` is declared
  `as const satisfies Record<EndpointName, EsiEndpointSpec>` where `EndpointName` is computed from
  every exported function in `endpoints.ts`, so a wrapper without a registry entry **fails to
  compile**; a registry entry without the matching marker comment **fails `registry.test.ts`**
  (its marker-parity check). Both are required, not just the registry row.
- `src/app/App.tsx` — **do not hand-write a `<Route path="/clones">`.** `App.tsx` builds its
  routes from `ROUTE_ELEMENTS`, declared `satisfies Record<AppRoutePath, ReactElement>` where
  `AppRoutePath = keyof typeof ROUTE_REQUIREMENTS` (`src/app/routeScopes.ts`), and every element
  in `ROUTE_ELEMENTS` is wrapped in `<ScopeGate path={path}>` automatically. A literal
  hand-written `<Route>` bypasses `ScopeGate` entirely and fails `routeScopes.test.ts`, which
  scans `App.tsx`'s source for exactly this. The correct change is two edits that must land
  together: add `'/clones': <Clones />` to `ROUTE_ELEMENTS` in `App.tsx`, **and** add a
  `'/clones'` entry to `ROUTE_REQUIREMENTS` in `src/app/routeScopes.ts` (as `UNGATED` if the
  route mixes panels the way `/skills`/`/industry` do, or as a `GatedRoute` naming its
  endpoints if a missing scope should replace the whole page). Either half missing without the
  other fails to compile — `ROUTE_ELEMENTS`'s `satisfies` requires every key of
  `ROUTE_REQUIREMENTS` and no others.
- `src/app/Layout.tsx` — nav entry in the Character section of the desktop rail **and** in the
  `MobileMoreSheet` function. The mobile bottom bar is already full at 4 primary tabs + More —
  this goes in the sheet, not the bar. Use `useLockedRoutes`/`NavItem`'s `locked` prop the same
  way the existing nav entries do, so a missing-scope Clones link grays out consistently with
  every other nav item.
- `src/i18n/locales/en.json` — new `clones.*` block + `nav.clones`.
- `e2e/support/mockEsi.ts` + `e2e/support/fixtureData.ts` — see Tests.
- `docs/ARCHITECTURE.md` §2/§6 — new feature row (also fix the §6 staleness noted in the orchestrator baseline).
- `CONTEXT.md` — **round-4 glossary block**. This item introduces vocabulary the ubiquitous language does not yet carry: **Jump Clone**, **Home Clone**, **Clone Jump Cooldown**. Rounds 2 and 3 each added terms as features landed (Remap Marker, Facility Preset, Market Browser, Data Age); this should follow that convention rather than drift. Orchestrator should assign one owner for a single round-4 block covering items 13/16/20.

### New modules

| Path                                                | Responsibility                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `src/engine/clones.ts` + `.test.ts`                 | Pure jump-cooldown / max-clone math (TDD-required).                 |
| `src/features/character/clones.ts` + `.test.ts`     | Read-through cache wrapper for `/characters/{id}/clones`.           |
| `src/features/character/structures.ts` + `.test.ts` | Structure name resolution with the 403-tolerant policy.             |
| `src/features/character/CloneCard.tsx`              | One clone: name/location + implant chip row (reuses `ImplantChip`). |
| `src/routes/Clones.tsx`                             | The view.                                                           |

### Shared primitives needed

Naming these rather than building private one-offs — orchestrator assigns owners:

1. **Station-or-structure location resolver.** Both this item and Assets (and
   Contracts `start/end_location_id`, Orders `location_id`) want "give me a
   display name for this location_id". Today `stations.ts` covers half of it.
   Wanted: one module that dispatches station vs structure and returns the
   `#id` fallback. **This should be one shared module, not a Clones-private
   copy.**
2. **`DataTable`** — shipped in `src/components/ui/` (`DataTable.tsx`, exported from
   `components/ui/index.ts`). The jump-clone list is card-shaped, so it's optional here — but
   Item 16's pin table genuinely wants it. Reuse the existing component; do not build a second one.
3. **A countdown/relative-time display.** `src/lib/duration.ts:6-17`
   `formatDuration(totalSeconds)` → "Xd Yh Zm" already exists and covers the
   cooldown remaining. No new primitive needed; just reuse it (don't re-copy —
   commit `117eab0` already de-duplicated it once).

### Design tokens / components used

`Panel` (one per section: Home Clone / Active Clone / Jump Clones), `StatChip`
(cooldown remaining, clones used vs max — tone `success` when ready, `warning`
while on cooldown), `DataAgeBadge` (**required**, DESIGN.md §5), `EmptyState`
("No jump clones installed"), `Spinner`, `ReauthBanner` (only for the _clones_
403, never the structures one), `ImplantChip` (reused as-is). Uppercase
`tracking-widest` `text-xs` micro-headings per DESIGN.md §2; `rounded-xs`,
1px `border-line` hairlines; density over whitespace. Exactly **one** `primary`
button on the view — the manual Refresh (matching `Skills.tsx`'s pattern) or the
re-login CTA, never both simultaneously.

### Tests

**TDD-required: `src/engine/clones.test.ts`** (write failing first):

- `jumpCooldownSeconds(0) === 24*3600`; `(5) === 19*3600`; clamps level >5 to 19h and negatives to 24h.
- `cloneJumpRemainingSeconds` with `last_clone_jump_date` **undefined** → `0` (never jumped = ready). This is the case the schema's optionality makes real.
- Remaining seconds mid-cooldown, and exactly `0` (not negative) once past.
- `nowMs` injected — assert the function is deterministic under a fixed `nowMs` (no `Date.now()` inside).
- `maxJumpClones(5, 5) === 10`; `(0,0) === 0`.

`src/features/character/clones.test.ts`: cache hit/miss/offline-fallback; a 403
on `/clones` yields `needsReauth: true`.

`src/features/character/structures.test.ts`: **a 403 does NOT set
`needsReauth`** and returns `null` (the anti-regression test for the trap above);
a live 200 caches under `GLOBAL_CACHE_CHARACTER_ID`.

E2E (`e2e/clones.spec.ts`, optional but cheap): renders clone list + cooldown.
**`e2e/support/mockEsi.ts` additions are mandatory, not optional**, for anything
that touches these routes — `mockEsi.ts:108-110` calls `route.fallback()` on any
unknown ESI path, which the network guard in `e2e/support/testBase.ts` turns into
a hard test failure. Add: `/characters/{id}/clones`,
`/universe/structures/{id}` (mock one 200 and one 403 to cover the degrade), plus
`JUMP_CLONES` in `fixtureData.ts`.

### i18n keys (`src/i18n/locales/en.json`)

```
nav.clones
clones.title, clones.homeClone, clones.activeClone, clones.jumpClones
clones.cooldown, clones.cooldownReady, clones.cooldownRemaining
clones.clonesUsed            "{{used}} / {{max}} jump clones"
clones.implants, clones.implantsNone
clones.unnamedClone          "Clone #{{id}}"
clones.structureLabel        "Structure #{{id}}"      (mirrors assets.structureLabel)
clones.stationLabel          "Station #{{id}}"
clones.locationUnknown
clones.empty, clones.emptyHint
clones.reauthTitle, clones.reauthHint, clones.reauthAction
clones.infomorphHint         tooltip explaining the 24h − 1h/level rule
```

### Sync / Dexie impact

**None.** Clones are API-Derived Data (CONTEXT.md glossary) — never synced. No
Editable Data field, no `sync.`-prefixed setting, so no `src/sync/` push/pull
mapping (the `d90e417` pattern does not apply here). No Dexie version bump: the
generic `esiCache` table is keyed `[characterId+key]` (`src/db/index.ts:112`) and
takes arbitrary new keys without a schema change.

### New ESI scopes

`esi-clones.read_clones.v1` (required) + `esi-universe.read_structures.v1`
(recommended, also fixes shipped `/assets` labels). **Must go in the single
batched re-auth with items 16 and 20.**

### Cost

**CONFIRM M**, at the low end — closer to S+ if `esi-universe.read_structures.v1`
is dropped. One endpoint wrapper, one ~40-line pure engine module, one data
module, one route, plus the structure resolver. The genuinely new work is the
403 policy and the shared location resolver, not the view.

### Depends on

- **The batched-scope decision** (items 13/16/20) — must land as one coordinated set of
  `ESI_REGISTRY` entries in `src/esi/registry.ts` (one per new endpoint wrapper); nothing here
  can ship until that call is made.
- Shared **station-or-structure location resolver** — if the orchestrator assigns
  it to the Assets/UX item instead, Item 13 consumes it rather than owning it.
- Not blocked by anything else.

### Risks / open questions

1. **Does `esi-universe.read_structures.v1` go in the batch?** Recommend yes.
2. **Where do implants live afterwards?** Moving them off `/skills` breaks a
   shipped view's muscle memory; duplicating them means two panels. Recommend:
   keep the Skills panel (it justifies the attribute math there,
   `Skills.tsx:216-218`) and show the _full per-clone_ set on `/clones`.
3. **Cooldown skill level source.** `esi-skills.read_skills.v1` is already
   granted, so Infomorph Synchronizing's level is free from
   `loadCharacterSkills` (`data.ts:37-45`) — no extra call. But if the character
   has never trained it, ESI omits the skill entirely; treat absent as level 0.
4. **Nav pressure.** The Character section already has 6 entries plus a full
   mobile tab bar. Items 13, 16 and 20 together add ~3 more destinations. A
   nav/IA decision the orchestrator should make once, across all three.

---

## Item 16 — Planetary industry

**Artifact claim:** "Missing and genuinely useful — it is a passive income users
forget about. New scope, new engine module, new view."

**Verdict:** CONFIRMED — nothing PI-related exists (`grep -rni "planet|colony|
extractor|schematic" src/` → zero functional hits) and all three additions are
real. Two things the teardown does not say: the SDE dependency is **mandatory**
(the public schematics endpoint is useless for it), and **half the ESI response
is deliberately stale**, which reshapes what v1 should promise.

### Verified baseline

- No `esi-planets.*` scope anywhere in `ESI_REGISTRY` (`src/esi/registry.ts`).
- No planets endpoint wrapper (`src/esi/endpoints.ts` — nothing).
- No engine module (`find src/engine -type f` → plan/schedule/sp, optimizer/\*, industry/\*, import/\*; no PI).
- `scripts/build-sde.mjs:21-29` downloads 7 CSVs and emits exactly three files (`build-sde.mjs:322-326`): `skills.json`, `blueprints.json`, `types.json`. No planet tables.
- Existing shipped payload: `public/data/` = 2.29 MB (blueprints 1.46 MB, types 0.73 MB, skills 0.11 MB).

### Endpoint shapes — spec-verified

Both `esi-planets.manage_planets.v1`, both `x-cache-age: 600`, both rate-limit
group **`char-industry` (600 tokens / 15m)**.

**1. Colony list** — `GET /characters/{character_id}/planets` →
`CharactersCharacterIdPlanetsGet`, array; **all fields required**:
`{ solar_system_id, planet_id, planet_type ('temperate'|'barren'|'oceanic'|'ice'|
'gas'|'lava'|'storm'|'plasma'), owner_id, last_update (date-time), upgrade_level,
num_pins }`.

**2. Per-planet detail** — `GET /characters/{character_id}/planets/{planet_id}` →
`CharactersCharacterIdPlanetsPlanetIdGet`; required keys `links`, `pins`,
`routes`:

```
pins[]:   pin_id, type_id, latitude, longitude          (required)
          schematic_id?, install_time?, expiry_time?, last_cycle_start?
          contents?: [{ type_id, amount }]
          extractor_details?: { heads[] (required: head_id, latitude, longitude),
                                cycle_time? (seconds), head_radius?,
                                product_type_id?, qty_per_cycle? }
          factory_details?:   { schematic_id }           (required)
links[]:  source_pin_id, destination_pin_id, link_level  (all required)
routes[]: route_id, source_pin_id, destination_pin_id,
          content_type_id, quantity, waypoints?          (first five required)
```

**⚠ Optionality is aggressive here — more so than for clones.** `pins[]`
requires only `pin_id, type_id, latitude, longitude`; `expiry_time`,
`install_time`, `last_cycle_start` and `schematic_id` are all optional. Worse,
`extractor_details` requires only **`heads`** — `cycle_time`, `qty_per_cycle`,
`product_type_id` and `head_radius` are all optional. Since the decay formula
opens with `bar_width = cycle_time / 900`, a spec-legal response can divide by
`undefined`.

**Adapter rule (specify it, don't leave it to the implementer):** an extractor
pin missing `cycle_time` **or** `qty_per_cycle` **or** `expiry_time` is **not**
converted to an `ExtractorProgram` — it is excluded from all yield/idle math but
still **listed in the pin table** with a "program data unavailable" state. Never
substitute a default. Consequently `ExtractorProgram`'s fields stay
non-optional (the engine keeps a clean total shape) and the narrowing happens
once, in `features/pi/adapters.ts`. `colonyStatus` already returns
`expiresAtMs: null` for a factory-only colony; a colony whose only extractors
were excluded takes that same path.

### ⚠ THE STALENESS AXIS — make this first-class in the UI

The endpoint's own spec description: _"Note: Planetary information is only
recalculated when the colony is viewed through the client. Information will not
update until this criteria is met."_ That splits the response in two:

| Trustworthy (fixed at install, does not drift)                              | Untrustworthy (only recalculated on in-client view) |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| `expiry_time`, `install_time`                                               | `pins[].contents[].amount`                          |
| `extractor_details.cycle_time`, `qty_per_cycle`, `heads`, `product_type_id` | `last_cycle_start`                                  |
| `schematic_id`, `factory_details`, `links`, `routes`                        | anything derived from current stock                 |

**This is what makes the smaller v1 principled rather than merely cheaper.**
Idle/expiry warnings run _entirely_ on trustworthy fields. Anything of the form
"storage 87% full" or "chain stalled — silo empty" depends on `amount` and would
confidently display wrong numbers.

The view therefore needs **two** staleness signals, and they are different
things — do not collapse them:

1. `DataAgeBadge` — when _we_ last fetched from ESI (DESIGN.md §5, required).
2. The colony's own `last_update` per row — when _CCP_ last recalculated it.
   Surface as a per-colony `StatChip`/column with a tooltip explaining the
   in-client-view rule.

### N+1 requests and rate limiting

One colony-list call + **N per-planet calls per character**, N = colony count
(≤6 in practice: 1 base + Interplanetary Consolidation level; the exact cap is
not load-bearing given the limiter below).

- `src/esi/client.ts:167-170` retries **once** on 429/420, capped at
  `MAX_RETRY_WAIT_MS = 10_000` (`client.ts:15`). It has no queue and no token-bucket
  awareness. Firing N detail calls via a bare `Promise.all` is exactly the shape
  that trips it.
- The `char-industry` bucket (600/15m) is **already shared with two endpoints
  this app consumes today**. Verified by listing every path in that bucket:
  `agents_research`, `blueprints`, `industry/jobs`, `mining`, `planets`,
  `planets/{planet_id}`. Of those, `/characters/{id}/industry/jobs` is consumed
  by `src/features/industry/jobs.ts:24-34` and `/characters/{id}/blueprints` by
  `src/esi/endpoints.ts:116-124` (paginated — potentially many requests). PI +
  Industry on the same character draw from one allowance. Note also that
  `agents_research` (item 20's research points) lands in the **same** bucket —
  worth telling that agent.
- **Specification:** route the per-planet fan-out through a concurrency limiter
  (cap 3-4, well under `typeNames.ts`'s 10 since these are authenticated calls in
  a small bucket). The limiter already exists as
  `mapWithConcurrencyLimit` — but it is **private** at
  `src/features/character/typeNames.ts:35-49`. It needs extracting to a shared
  home (`src/lib/concurrency.ts`); see Shared primitives.
- Fetch detail lazily where possible: render the colony list from the single list
  call, fan out detail only for colonies actually expanded/visible. That turns
  N+1 into 1 in the common case.

### Cache keys for `src/esi/cache.ts`

Getting the per-character vs public split right matters here:

| Key                       | `characterId`               | Why                                                                                                                                              |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planets`                 | real character id           | Colony list is character-owned.                                                                                                                  |
| `planet:{planet_id}`      | real character id           | Colony _layout_ is character-owned. Keying it globally would leak one character's colony into another's view.                                    |
| `planet-info:{planet_id}` | `GLOBAL_CACHE_CHARACTER_ID` | Planet **name**/system/type from public `GET /universe/planets/{id}` — public and immutable. Same shape as `stations.ts:10-12`'s `station:{id}`. |
| `system:{system_id}`      | `GLOBAL_CACHE_CHARACTER_ID` | Public, immutable.                                                                                                                               |

Use `loadWithCacheStatus` with the `jobs.ts:29-32` policy — `detectAuthFailure:
403 only` + `skipCacheOnAuthFailure: true` — for both authenticated PI calls: a
character that never granted `esi-planets.manage_planets.v1` has never cached a
PI response, so there is nothing to degrade to and a reauth prompt is the correct
answer. This is the _opposite_ of the structures policy in Item 13; both
overrides must be written deliberately.

### SDE dependency — investigated, measured

`GET /universe/schematics/{id}` returns **only** `{schematic_name, cycle_time}`
(spec-verified). No inputs, no outputs, no quantities. So "what does this factory
produce, from what, how fast" **must** come from the SDE.

**The tables exist in the Fuzzwork CSV dump `build-sde.mjs` already pulls from**
(`BASE_URL = https://www.fuzzwork.co.uk/dump/latest/csv/`, `build-sde.mjs:10`).
Downloaded and inspected 2026-08-29:

| CSV                           | HTTP | Size   | Rows | Columns                                                   |
| ----------------------------- | ---- | ------ | ---- | --------------------------------------------------------- |
| `planetSchematics.csv`        | 200  | 2.1 KB | 68   | `schematicID, schematicName, cycleTime`                   |
| `planetSchematicsTypeMap.csv` | 200  | 4.6 KB | 203  | `schematicID, typeID, quantity, isInput`                  |
| `planetSchematicsPinMap.csv`  | 200  | 6.7 KB | 496  | `schematicID, pinTypeID` (which factory tiers can run it) |

**Measured payload impact** (built the actual JSON, did not estimate):

| Output                                                                                                     | Delta                                                     |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| new `public/data/planetSchematics.json` (68 schematics, inputs+outputs+cycleTime, minified)                | **+10,980 bytes (~11 KB)**                                |
| `types.json` growth to cover PI types (categories 41/42/43, published: 174 types, 133 not already present) | **728,921 → 738,286 bytes = +9,365 bytes (~9 KB)**        |
| **Total**                                                                                                  | **~20 KB uncompressed** on a 2.29 MB baseline — **+0.9%** |

`planetSchematicsPinMap` is only needed if the UI validates "can this factory run
this schematic"; the app reads real colonies, so it can be **skipped** (saves 6.7 KB
of source parsing, ~0 payload).

**`types.json` is not a drop-in add — it needs a new inclusion rule.**
`build-sde.mjs:299-318` builds `typeMap` from the _referenced_ set only (skill
prereqs + blueprint materials/products/skills). PI commodities and PI structures
are referenced by nothing in that graph, so they are silently excluded today. The
concrete edit is a new rule in that loop: _"also include published types whose
group's categoryID ∈ {41 Planetary Industry, 42 Planetary Resources, 43 Planetary
Commodities}"_ (category IDs verified against `invCategories.csv`; the relevant
groups are 1026 Extractors, 1027 Command Centers, 1028 Processors, 1029 Storage
Facilities, 1030 Spaceports, 1032/1033/1035 raw resources, 1034/1040/1041/1042
commodity tiers, 1036 Planetary Links, 1063 Extractor Control Units).

Also needed in `build-sde.mjs`: 2 new `FILES` entries (`build-sde.mjs:21-29`), a
4th `outputs` entry (`build-sde.mjs:322-326`), a `PlanetSchematicMap` type in
`src/sde/types.ts`, and `export const loadPlanetSchematics =
cached<PlanetSchematicMap>('planetSchematics.json')` in `src/sde/loadSde.ts:20-22`.

**Loading cost is scoped, not global.** `src/sde/loadSde.ts:9-22` memoizes
**per file**, lazily — nothing is fetched at boot. So `planetSchematics.json`
(+11 KB) is paid **only by users who open the PI route**. The `types.json`
+9 KB, however, is paid by every route that calls `loadTypes()` — i.e. Wallet /
Assets / Orders via `src/features/character/typeNames.ts:20`. Still 1.3% of an
already-shipped 0.73 MB file.

**📌 COORDINATION NOTE FOR THE ORCHESTRATOR.** Another agent is reviewing SDE
payload growth for **skill descriptions**. Same budget, same file
(`scripts/build-sde.mjs`), and probably the same `types.json`:

- **Merge-conflict risk is concrete** — both items edit the `FILES` array, the
  `outputs` array, and the type-inclusion loop in one ~360-line script. Sequence
  them or assign one owner.
- **Magnitude is wildly different.** PI is +20 KB (+0.9%). Skill descriptions are
  ~500 skills × multi-paragraph prose — plausibly +0.5-1.5 MB, i.e. a 25-60%
  increase on a 2.29 MB baseline. If a payload cap is being set, PI should not be
  the thing that gets squeezed; it is rounding error by comparison.

### Engine module — sketch

Path: **`src/engine/pi/`** (mirrors `src/engine/industry/`). Pure: no fetch, no
DOM, no Dexie, no `Date.now()`. TDD-required per CLAUDE.md.

**`src/engine/pi/types.ts`** — engine-native shapes, adapted from ESI at the
feature boundary (the `engine/industry/types.ts` convention). Every field is
**non-optional by design** — the adapter drops incomplete pins rather than
passing partial programs into the math (see the optionality note above):

```ts
interface ExtractorProgram {
  cycleTimeSeconds;
  qtyPerCycle;
  headCount;
  installTimeMs;
  expiryTimeMs;
  productTypeId;
}
interface ColonyStatus {
  planetId;
  idle: boolean;
  expiresAtMs: number | null;
  secondsUntilIdle: number | null;
}
```

**`src/engine/pi/extractorYield.ts`** — CCP's published decay formula, verbatim
from `https://developers.eveonline.com/docs/guides/pi/`:

```
bar_width   = cycle_time / 900.0
t           = (cycle + 0.5) * bar_width
decay_value = qty_per_cycle / (1 + t * decay_factor)     // decay_factor = 0.012 (dogma attr 1683)
phase_shift = qty_per_cycle ** 0.7
sin_a       = cos(phase_shift + t * (1/12))
sin_b       = cos(phase_shift / 2 + t * 0.2)
sin_c       = cos(t * 0.5)
sin_stuff   = max((sin_a + sin_b + sin_c) / 3, 0)
bar_height  = decay_value * (1 + noise_factor * sin_stuff)  // noise_factor = 0.8 (dogma attr 1687)
output      = bar_width * bar_height
```

Exports: `cycleOutput(program, cycleIndex)`, `programOutput(program)` (sum over
`floor((expiry - install) / cycle_time)` cycles), `outputByCycle(program)` for a
sparkline. **`qty_per_cycle` from ESI is the _base_ value, not the actual
per-cycle yield** — naive `qty_per_cycle × cycles` materially overstates a
program. This ~20 lines of fully-specified math is the differentiating value of
the whole item.

**`src/engine/pi/colonyStatus.ts`** — the idle logic:

- `isExtractorIdle(program, nowMs)` → `nowMs >= expiryTimeMs`.
- `secondsUntilIdle(program, nowMs)` → `max(0, expiryTimeMs - nowMs) / 1000`.
- `colonyStatus(programs, nowMs)` → soonest expiry across a colony's extractors,
  plus an `idle` flag when **any** extractor has expired.
- `summarizeColonies(colonies, nowMs)` → sorted "attention first" ordering.

**Clock purity is specified, not assumed:** every one of these takes `nowMs` as
its **last parameter**. `Date.now()` is called once, in the route component, and
threaded down — identical to `jobs.ts:44` `jobProgress(job, nowMs)` and
`jobs.ts:55` `isJobDone(job, nowMs)`. This is what makes "will this colony go
idle at time T" testable without fake timers.

### Engine vs UI split

| Layer                                | Contents                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/pi/*` (**TDD-required**) | Decay curve, program totals, idle/expiry predicates, colony ordering.                                                                  |
| `src/features/pi/data.ts`            | `loadCharacterPlanets`, `loadPlanetDetail` (cache wrappers + concurrency-limited fan-out).                                             |
| `src/features/pi/adapters.ts`        | ESI `pins[]` → engine `ExtractorProgram[]`; joins `schematic_id` → `planetSchematics.json`. Impure-adjacent glue kept out of `engine`. |
| `src/features/pi/planetNames.ts`     | Public `GET /universe/planets/{id}` name resolution (global cache key).                                                                |
| `src/routes/PlanetaryIndustry.tsx`   | Composition, `Date.now()` injection, `DataAgeBadge`.                                                                                   |

### Files touched

- `src/esi/registry.ts` — the `ESI_REGISTRY` entries for `getCharacterPlanets` /
  `getCharacterPlanet` carry scope `esi-planets.manage_planets.v1`; `src/esi/scopes.ts`'s
  `SCOPES` derives it automatically. **Batch it.**
- `src/esi/endpoints.ts` — `getCharacterPlanets`, `getCharacterPlanet`, `getUniversePlanet`
  (public). Same compile/test requirement as Item 13's new wrappers: each needs a marker comment
  plus an `ESI_REGISTRY` entry in `src/esi/registry.ts`, or it fails to compile / fails
  `registry.test.ts` respectively (see Item 13's Files touched for why).
- `scripts/build-sde.mjs` — 2 `FILES` entries, PI category inclusion rule in the `typeMap` loop (`:299-318`), 4th output (`:322-326`). **⚠ conflicts with the skill-descriptions agent.**
- `src/sde/types.ts` + `src/sde/loadSde.ts` — `PlanetSchematicMap` + `loadPlanetSchematics`.
- `src/app/App.tsx` — add the new route to **both** `ROUTE_ELEMENTS` (`App.tsx`) and
  `ROUTE_REQUIREMENTS` (`src/app/routeScopes.ts`) together, same as Item 13's Clones route above
  — one without the other fails to compile.
- `src/app/Layout.tsx` — nav entry, desktop rail and the `MobileMoreSheet` function (mobile bottom
  bar is already full at 4 primary + More).
- `src/i18n/locales/en.json` — `pi.*` block.
- `e2e/support/mockEsi.ts` + `fixtureData.ts` — mandatory (fail-closed, `mockEsi.ts:108-110`).
- `docs/ARCHITECTURE.md` §2/§6.
- `CONTEXT.md` — **round-4 glossary block** (same shared block as Item 13). New terms: **Colony**, **Pin**, **Extractor**, **Schematic**, and — if the v1 boundary is accepted — a scope-decisions line stating that PI v1 is colony health only, production-chain graph deferred.

### New modules

`src/engine/pi/{types,extractorYield,colonyStatus}.ts` + `.test.ts` each ·
`src/features/pi/{data,adapters,planetNames}.ts` + tests ·
`src/features/pi/{ColonyCard,PinTable}.tsx` · `src/routes/PlanetaryIndustry.tsx` ·
`public/data/planetSchematics.json` (build artifact).

### Shared primitives needed

1. **`mapWithConcurrencyLimit`** — already shared, in `src/lib/concurrency.ts` alongside
   `ESI_FANOUT_CONCURRENCY`; `src/features/character/typeNames.ts` already imports it from there
   rather than defining it locally. PI's per-planet fan-out is simply a second consumer — reuse
   directly, no extraction needed. Pick a concurrency cap appropriate to the `char-industry`
   bucket (see below) rather than reusing `ESI_FANOUT_CONCURRENCY` unchanged.
2. **`DataTable`** — shipped in `src/components/ui/`. The pin table (dense, sortable,
   `tabular-nums`) is a natural consumer. Shared with Item 13 and item 20's tabs.
3. **New SDE payload field: `planetSchematics.json`** + the PI type-category
   inclusion rule in `types.json`. **Same shared artifact as the
   skill-descriptions item — assign one owner for `build-sde.mjs`.**
4. **`formatDuration`** (`src/lib/duration.ts:6`) — reuse for "extractor expires
   in Xd Yh Zm". Already shared; just import it.
5. **A solar-system name resolver.** `POST /universe/names` supports
   `solar_system` and `src/features/character/names.ts:19-42` already batches it;
   reuse rather than adding a new loader.

### Design tokens / components used

`Panel` per colony (or `DataTable` rows — already available in `src/components/ui/`) · `StatChip` for
`upgrade_level`, pin count, time-to-idle · `DataAgeBadge` **required** ·
`EmptyState` "No planetary colonies" · `Spinner` · `ReauthBanner` for the 403 ·
`InfoTooltip` on the `last_update` staleness rule and on "extractor output decays
over the program" (DESIGN.md §4 says `InfoTooltip` is exactly for labeling
jargon). Status color carries meaning, never decoration: `warning` for
"expires < 24h", `danger` for "already idle", `success` for healthy. Per DESIGN.md
§6 color is never the sole signal — pair each with a word. Density over
whitespace, `rounded-xs`, 1px hairlines, uppercase `tracking-widest` micro-headings,
**one** `primary` button (Refresh).

### Tests

**TDD-required, failing test first:**

`src/engine/pi/extractorYield.test.ts` — expected values derived from CCP's
published pseudocode itself (cited above), with `decay_factor = 0.012` and
`noise_factor = 0.8` named as dogma attrs 1683/1687:

- `bar_width = cycle_time / 900` for a 900s cycle → exactly 1.
- Cycle-0 output, hand-computed from the formula.
- `sin_stuff` is clamped at ≥ 0 (the `max(..., 0)` — a real branch).
- `decay_value` is **monotonically decreasing in `t`** for fixed `qty_per_cycle`.
- A hand-computed multi-cycle program total.
- Naive `qty_per_cycle × cycles` **overestimates** the decayed total. Assert only
  the _direction_, not a magnitude — the commonly-quoted "~25%" figure comes from
  a forum summary, not from CCP's page, and must not be encoded as an assertion.

`src/engine/pi/colonyStatus.test.ts`:

- Idle exactly at `expiryTimeMs` (boundary, `>=` not `>`).
- `secondsUntilIdle` never negative.
- A colony with **no** extractor pins (factory-only) → not idle, `expiresAtMs: null`.
- Multi-extractor colony reports the **soonest** expiry.
- Determinism under fixed `nowMs`; no `Date.now()` inside (assert the same input twice → identical output).

`src/features/pi/data.test.ts` — cache hit/miss/offline; 403 → `needsReauth` with
no stale fallback (`skipCacheOnAuthFailure`); the fan-out honors the concurrency
cap (count in-flight calls).

`src/features/pi/adapters.test.ts` — the spec-legal-but-partial cases, which is
where `NaN` would leak in:

- `extractor_details` **absent** entirely → pin skipped from yield math.
- `extractor_details` **present but without `cycle_time`** → skipped, no
  division by `undefined`, no `NaN` (this is the case the spec explicitly
  permits: `heads` is the only required key).
- extractor pin **without `expiry_time`** → skipped from idle math; the colony
  reports `expiresAtMs: null` rather than "idle".
- both above still appear in the pin list with an "unavailable" state (assert
  the pin is not silently dropped from the _table_, only from the math).
- `schematic_id` missing from the SDE map → graceful unknown, not a throw.

E2E `e2e/pi.spec.ts` (optional): **mock additions are mandatory** —
`/characters/{id}/planets`, `/characters/{id}/planets/{planet_id}`,
`/universe/planets/{id}`, plus a `public/data/planetSchematics.json` fixture.

### i18n keys (`src/i18n/locales/en.json`)

```
nav.pi
pi.title, pi.colonies, pi.colony
pi.planetType.temperate | barren | oceanic | ice | gas | lava | storm | plasma
pi.upgradeLevel, pi.pinCount, pi.lastUpdate, pi.lastUpdateTooltip
pi.extractors, pi.extractorProduct, pi.cycleTime, pi.qtyPerCycle, pi.headCount
pi.programOutput, pi.programOutputTooltip     (explains decay)
pi.expiresIn, pi.expired, pi.idle, pi.idleWarning, pi.healthy
pi.factories, pi.schematic, pi.inputs, pi.outputs
pi.storage, pi.stockStaleTooltip              (the "only updates in-client" caveat)
pi.empty, pi.emptyHint
pi.reauthTitle, pi.reauthHint, pi.reauthAction
pi.planetLabel     "Planet #{{id}}"
pi.systemLabel     "System #{{id}}"
```

### Sync / Dexie impact

**None.** PI data is API-Derived (CONTEXT.md) — never synced, no Editable Data
record, no `sync.`-prefixed setting, so no `src/sync/` push/pull mapping (the
`d90e417` pattern does not apply). No Dexie bump past `db.version(3)`
(`src/db/index.ts:107-114`): `esiCache` is keyed `[characterId+key]` and takes
new keys freely. _If_ a later iteration adds a user-set "warn me N hours before
expiry" threshold, **that** would be a `sync.`-prefixed setting via
`setSyncedSetting` and would need the full `d90e417` treatment — explicitly out
of scope for v1.

### New ESI scopes

`esi-planets.manage_planets.v1`. Nothing else — planet names, system names and
schematic names are all public. **Batch with items 13 and 20.**

### Cost — REVISED L → M (for the recommended v1)

The teardown's L is right for the _full_ feature (routed production-chain graph,
throughput balancing, ISK valuation). The recommended v1 below is **M**.

**RECOMMENDED v1 — "colony health dashboard"**

The discriminating question is: _does the idle warning need `links` and
`routes`?_ It does not. It needs `pins[].extractor_details.expiry_time`. So the
graph is cleanly deferrable and the highest-value half ships first.

Ships:

- Colony list (1 call/character) with planet name, type, system, `upgrade_level`,
  `num_pins`, and the colony's own `last_update` staleness indicator.
- Per-colony detail on expand (lazy, concurrency-limited): extractor pins with
  product, cycle time, head count, `expiry_time`, and **decayed program output**
  from `engine/pi/extractorYield`.
- Idle / expiring-soon warnings from `engine/pi/colonyStatus`.
- Factory pins listed flat with their schematic name + inputs/outputs from the
  new SDE payload.

Defers:

- The routed production-chain **graph** (`links`/`routes` visualization) — the
  expensive part, and the part that reads best in-game anyway.
- Factory throughput balancing / "is this chain input-starved" — depends on
  `contents[].amount`, which is exactly the untrustworthy field.
- Storage-fullness bars and ISK valuation of stock — same staleness problem, plus
  a market-price join.
- Multi-character roll-up.

Keep the decay formula **in v1**: it is ~20 lines of fully-specified pure math,
it is the numerically differentiating feature, and without it the output numbers
are simply wrong.

### Depends on

- **The batched-scope decision** (13/16/20) — hard blocker.
- **`scripts/build-sde.mjs` ownership**, shared with the skill-descriptions item.
  Sequence, or one owner. The PI change is small; land it in whichever order
  minimizes conflict.
- ~~`mapWithConcurrencyLimit` extraction~~ — not needed; already lives in `src/lib/concurrency.ts`.
- `DataTable` — already shipped in `src/components/ui/`; use it directly rather than `Panel` +
  a plain table.

### Risks / open questions

1. **The `manage_planets` consent-screen wording** vs. CONTEXT.md's read-only
   promise. Product call — see the cross-cutting section.
2. **The staleness caveat is a support-load risk.** Users will compare our
   numbers to the in-game client and report a bug. The `last_update` chip +
   tooltip is mitigation, not a fix. Worth being explicit in the UI copy.
3. **Formula drift.** CCP's decay constants are dogma attributes 1683/1687, i.e.
   balance-tunable. Hardcode them but name them and cite the source in the module
   header (matching the `dogma.ts:1-18` house style of documenting attribute-ID
   provenance).
4. **`char-industry` bucket contention** with the shipped Industry Jobs panel on
   the same character. Not a problem at N ≤ 6 with a limiter, but worth a comment
   in `features/pi/data.ts`.
5. **Nav pressure**, shared with Item 13 — three new destinations across items
   13/16/20 against a full mobile tab bar. One IA decision, made once.

---

## Primary sources checked (all fetched/verified 2026-08-29)

| Source                                                                                         | What it settled                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://esi.evetech.net/meta/openapi.json` (OpenAPI 3.1.0, downloaded in full)                | Exact scope strings, full request/response schemas + `required` lists for `/characters/{id}/clones`, `/characters/{id}/planets`, `/characters/{id}/planets/{planet_id}`, `/universe/structures/{id}`, `/universe/planets/{id}`, `/universe/schematics/{id}`; the complete scope→path map (63 scopes); rate-limit groups; `x-compatibility-date` on every new path; the `POST /universe/names` category enum (**no `planet`**). |
| `https://developers.eveonline.com/docs/guides/pi/` (CCP official)                              | The extractor decay formula verbatim, `decay_factor = 0.012` (dogma 1683), `noise_factor = 0.8` (dogma 1687), and that `qty_per_cycle` is the ESI-returned **base** value.                                                                                                                                                                                                                                                     |
| Fuzzwork SDE `invTypes.csv` (the dump `build-sde.mjs:10` already uses)                         | Infomorph Synchronizing = typeID **33399**, description _"Reduced time between clone jumps by 1 hour per level."_; Infomorph Psychology 24242 _"Allows 1 jump clone per level"_; Advanced Infomorph Psychology 33407 _"Allows 1 additional jump clone per level"_.                                                                                                                                                             |
| Fuzzwork `planetSchematics.csv` / `planetSchematicsTypeMap.csv` / `planetSchematicsPinMap.csv` | Present in the dump `build-sde.mjs` already downloads from; 68 / 203 / 496 rows; columns as listed. Built the actual JSON to measure **+10,980 bytes**.                                                                                                                                                                                                                                                                        |
| Fuzzwork `invCategories.csv` / `invGroups.csv` / `invTypes.csv`                                | PI categories **41 / 42 / 43** and their 16 groups; 174 published PI types, 133 absent from today's `types.json`; measured `types.json` delta **+9,365 bytes**.                                                                                                                                                                                                                                                                |
| EVE University wiki, _Jump clone_                                                              | Base cooldown **24h**, Infomorph Synchronizing **−1h/level**, minimum **19h** at level V.                                                                                                                                                                                                                                                                                                                                      |
