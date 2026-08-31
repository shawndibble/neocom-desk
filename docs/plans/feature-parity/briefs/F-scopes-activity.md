# Brief F — Scopes & Activity (items 15a, 15b, 17)

Area: `src/auth/`, `src/esi/{scopes,client,cache}.ts`, `src/components/ui/ReauthBanner.tsx`,
`src/db/index.ts`. Read-only investigation; nothing in the repo was modified.

---

## Item 15a — Cache purge on scope revoke (privacy fix)

**Artifact claim:** "Half done. `ReauthBanner` and `isAuthFailure` cover the failure path.
Missing: choosing scopes at login, and purging `esiCache` on revoke. Do the purge even if the
picker waits — stale data behind a revoked scope is a privacy bug."

**STATUS: SHIPPED.** This is done, not a gap. `src/esi/scopes.ts` exports pure
`revokedScopes(previous, next)` (order-independent, additive-safe — a widened grant purges
nothing). `src/auth/session.ts`'s `persistTokens` — the single funnel for both `completeLogin`
and the refresh path inside `getValidAccessToken` — calls a purge helper before the token record
write, covering a scope revoke, an `ownerHash` change, and a previously-suppressed purge
retrying. `src/sync/planSync.ts`'s `handleOwnerHashChange` purges the same way for the
sold/transferred-character case. `src/esi/cachePurge.ts` holds the single purge primitive
(`purgeCharacterCache` / `purgeCharacterCacheOrSuppress`) with a three-tier degrade — targeted
range-delete, then full `esiCache.clear()`, then suppress-and-retry recorded in `db.settings` so
a broken store can't leak a stale read after reload. None of it throws out of `persistTokens`, so
a purge failure never costs the user their login.

What follows is the original investigation, corrected where the shipped code has moved past it.
One real gap remains (no logout/character-removal) and one real decision is still open (blunt
purge vs. surgical).

### Verified baseline

- **Scopes are decoded correctly.** `decodeAccessToken` reads the JWT `scp` claim and
  normalizes string-or-array to `string[]` (`src/auth/jwt.ts`). Covered by `src/auth/jwt.test.ts`.
- The granted scope set lives on **`TokenRecord`** (`src/db/index.ts`, field `scopes: string[]`),
  not on `CharacterRecord`.
- **`persistTokens` is the single funnel**, called from both `completeLogin` and the refresh path
  inside `getValidAccessToken` — exactly why the purge hook lives there rather than in
  `routes/Callback.tsx`, which would miss the refresh path (a refresh grant carries a fresh JWT
  whose `scp` reflects a portal-side revoke).
- **DONE — an endpoint→scope mapping now exists.** `src/esi/registry.ts`'s `ESI_REGISTRY` maps
  all 24 endpoint wrappers in `endpoints.ts` to `{route, scope}`, declared
  `as const satisfies Record<EndpointName, EsiEndpointSpec>` so a wrapper without a matching entry
  fails to compile. `src/esi/scopes.ts`'s `SCOPES` is derived from it (deduplicated scopes across
  every registry entry), not hand-maintained.
- **DONE — the drift is closed.** `e2e/support/fixtureData.ts` re-exports `SCOPES` from
  `src/esi/scopes.ts` instead of re-listing it. One source of truth, not three.
- **Cache-key inventory (all character-scoped keys today):** `skills`, `attributes`,
  `implants`, `skillqueue` (`src/features/skills/data.ts`); `wallet:balance`,
  `wallet:journal`, `wallet:transactions` (`src/features/character/wallet.ts`);
  `assets` (`assets.ts`); `mail:headers`, `mail:{mailId}` (`mail.ts`);
  `calendar`, `calendar:{eventId}` (`calendar.ts`); `contracts` (`contracts.ts`);
  `orders`, `orders:history` (`orders.ts`); `blueprints`
  (`src/features/industry/data.ts`); `industryJobs` (`src/features/industry/jobs.ts`).
- **Global (public) keys — must NOT be purged:** `name:{id}` (`src/features/character/names.ts`),
  `type:{id}` (`src/features/character/typeNames.ts`, also `src/features/skills/data.ts`),
  `station:{id}` (`src/features/character/stations.ts`). All written under
  `GLOBAL_CACHE_CHARACTER_ID` (`src/esi/cache.ts`). `purgeCharacterCache` guards this explicitly
  and it is asserted by test.
- **DONE — the ownerHash instance of the bug is fixed.** `handleOwnerHashChange`
  (`src/sync/planSync.ts`) purges `esiCache` via `purgeCharacterCacheOrSuppress` alongside
  `skillPlans`/`buildPlans` when a character's `ownerHash` changes.
- **Remaining real gap — no logout/character-removal.** A repo-wide grep for
  `db.characters.delete` / `db.tokens.delete` still finds nothing in `src/`.
  `src/routes/Characters.tsx` only lists and switches characters; there is no remove button. This
  is the one item from the original investigation still open.

### Gap (revised)

1. ~~No scope diff on login/refresh.~~ **DONE** — `revokedScopes` + the `persistTokens` hook.
2. ~~No purge primitive on `esiCache`.~~ **DONE** — `purgeCharacterCache` /
   `purgeCharacterCacheOrSuppress` in `src/esi/cachePurge.ts`.
3. No key→scope mapping at the cache-key level, so the shipped purge is blunt (whole-character)
   rather than surgical (revoked-scope-only). This is a decision to make, not an omission to fill
   — see below.
4. ~~`handleOwnerHashChange` does not purge API-derived cache.~~ **DONE.**
5. **Still open:** no logout/character-removal, so `purgeCharacterCache` still has only two
   callers (scope-revoke, ownerHash-change) rather than the three the original design anticipated.

### Blunt vs. surgical — a decision to revisit, not a gap to fill

`src/esi/cachePurge.ts`'s own header comment documents the blunt choice as deliberate: `esiCache`
is 100% re-derivable API-derived data, so over-purging costs one refetch while under-purging is a
privacy bug; and "Precision would need a cache-key → scope map; `registry.ts` keys on endpoint
_name_ and cache keys are string literals in `features/*` with no link back to it." So the
question for the orchestrator is whether to reverse that decision — not whether to build the
mechanism from scratch, since part of it already exists.

If reversing it: **do not add a second registry (a new `src/esi/cacheKeys.ts`)**.
`src/esi/registry.ts` already is "one registry, two consumers" (`scopes.ts` and
`app/routeScopes.ts` both derive from it today) and already carries `route` per entry. The
natural extension is a third field — a `cacheKeyPrefix` or similar — on `EsiEndpointSpec`, so one
row keeps serving every consumer instead of a second hand-maintained table drifting from the
first. `registry.ts`'s own docstring already states the "must never grow auth state... must
never be imported by `src/engine`" constraints that would apply to this extension too.

The mapping would need to be **prefix→scope, not exact-key→scope**: `mail:{id}`, `calendar:{id}`,
`type:{id}` are key _families_, and `type:{id}` under `GLOBAL_CACHE_CHARACTER_ID` must stay
outside any scope mapping (public, no consent to revoke).

**Dexie mechanics, unchanged by this decision:** the only index on `esiCache` is the compound
`[characterId+key]` — no standalone `characterId` index — which is exactly why the shipped purge
(`purgeCharacterCache`) is a full range-delete rather than an equality match. A surgical purge
would still range-delete per character, filtering the resulting rows by prefix before deleting.

**Recommendation:** leave the blunt purge as shipped unless a specific over-purge cost shows up in
practice (e.g. a character with many scopes losing everything on one narrow revoke). The
mechanism to go surgical is cheaper to build than the original investigation assumed — a field on
an existing table, not a new module — but it is still work to spend deliberately, not a default.

### Files touched

Already done (for reference — no further action needed):

- `src/auth/session.ts` — the purge hook, called from `persistTokens` before the `db.tokens.put`.
- `src/esi/cachePurge.ts` — `purgeCharacterCache`, `purgeCharacterCacheOrSuppress`, the
  suppression-marker tiering.
- `src/esi/scopes.ts` — `revokedScopes`.
- `src/sync/planSync.ts` — `handleOwnerHashChange` purges `esiCache` alongside plans.
- `e2e/support/fixtureData.ts` — imports `SCOPES` rather than re-listing it.

If pursuing the blunt→surgical reversal:

- `src/esi/registry.ts` — add the cache-key-prefix field to `EsiEndpointSpec`.
- `src/esi/cachePurge.ts` — `purgeCharacterCache` gains a scope-filtered path.

### New modules

None currently needed. The original investigation proposed a new `src/esi/cacheKeys.ts` —
superseded; see "Blunt vs. surgical" above for why extending `registry.ts` is the right shape if
this is ever pursued.

### Shared primitives needed

- **`purgeCharacterCache`** — done, in `src/esi/cachePurge.ts`, with two callers today
  (scope-revoke via `session.ts`, ownerHash-change via `planSync.ts`) and room for a third
  (a future logout/remove-character).
- **A single `SCOPES` source of truth** — done, consumed by `loginFlow`, `scopes.test.ts`, and the
  e2e fixture, all deriving from `registry.ts`.

### Design tokens / components used

None — 15a is entirely non-visual. Purging on revoke makes existing views fall to
`EmptyState`/`ReauthBanner` naturally, which is correct.

### Tests

Already shipped (TDD, per CLAUDE.md):

- `src/esi/scopes.test.ts` — `revokedScopes`: pure, order-independent, additive-safe.
- `src/auth/session.test.ts` — scope-narrowing purges, scope-widening is a no-op, a token
  _refresh_ with a narrower `scp` also purges, another character's rows are untouched,
  `GLOBAL_CACHE_CHARACTER_ID` rows survive.
- `src/esi/cachePurge.test.ts` — range-delete correctness and the escalating degrade tiers.
- `src/sync/planSync.test.ts` — ownerHash change purges `esiCache` alongside plans.

Still needed only if the blunt→surgical reversal is pursued: a registry-completeness test (every
`Scope` mapped, every mapped prefix a real `Scope`).

No e2e needed; this is invisible in the UI by design.

### i18n keys

None. If the orchestrator wants the revoke surfaced to the user (recommended as part of item 17,
not here): `activity.scopeRevoked`.

### Sync / Dexie impact

**None.** No schema bump, no push/pull mapping. `TokenRecord.scopes` already exists and
`esiCache` is API-derived and never synced (CONTEXT.md).

### New ESI scopes

None.

### Cost

**Already spent — this item is done.** Any further work here is either the logout/remove-
character feature (small, and needed anyway as the app's third purge caller) or the blunt→
surgical reversal (a registry field plus a filtered delete path — smaller than the original
estimate now that `registry.ts` exists to extend).

### Depends on

Nothing outstanding.

### Risks / open questions

- **Blunt vs. surgical** — see above; the one live decision left in this item.
- **No logout/character-removal yet.** When it lands, it should call the existing
  `purgeCharacterCache` primitive rather than growing a second copy.
- **`GLOBAL_CACHE_CHARACTER_ID` is a real-looking characterId (0).** No EVE character has id 0, so
  the guard in `purgeCharacterCache` is safe, but it's explicit rather than incidental — keep it
  that way in any future edit.

---

## Item 15b — Scope picker at login

**Artifact claim:** (same teardown quote) "...Missing: choosing scopes at login..."

**Verdict:** CONFIRMED — `SCOPES` is a derived, order-cosmetic list (`src/esi/scopes.ts`),
spread wholesale into `startLogin` with no user input (`src/app/loginFlow.ts`). There is no
scope UI anywhere. (There is a `/settings` route, `src/routes/Settings.tsx` — routed in
`App.tsx` — but it holds device-local display preferences only; it is not a place a scope
picker exists today.)

### Verified baseline

- `beginEveLogin()` is one line: `assignLocation(await startLogin([...SCOPES]))`
  (`src/app/loginFlow.ts`). It takes no arguments and is called from `Login.tsx`,
  `Characters.tsx`, and every `ReauthBanner` `onLogin`.
- `startLogin(scopes: string[], config?)` **already accepts an arbitrary scope array**
  (`src/auth/session.ts`) and joins it into the authorize URL (`src/auth/sso.ts`). The auth layer
  needs no change — only the caller does.
- **Degradation is now structural for single-scope routes, and this narrows what 15b still has
  to cover.** `src/app/routeScopes.ts`'s `ROUTE_REQUIREMENTS` declares `/assets`, `/mail`,
  `/calendar`, `/contracts`, `/orders` as gated routes, each listing the ESI endpoints its
  content depends on. `src/app/ScopeGate.tsx` wraps every route in `App.tsx`'s `ROUTE_ELEMENTS`
  and renders `ReauthBanner` **in place of the route's content** — before any fetch happens —
  when the active Character's granted scopes don't cover what the route declares. So these five
  views no longer render empty on a missing scope; they render a re-auth prompt.
- **`/overview`, `/skills`, `/industry`, `/wallet` are deliberately left `UNGATED`** in
  `routeScopes.ts` because each mixes panels backed by different scopes — a page-level gate
  would hide panels that still work. These need panel-level handling instead, and it is
  uneven:
  - `Wallet.tsx` and `Skills.tsx` already call the status-aware loader for their primary data
    (`loadWalletBalanceWithStatus`, `loadCharacterSkillsWithStatus`) and render `ReauthBanner`
    on `needsReauth`.
  - `src/features/industry/ActiveJobsPanel.tsx` does the same via `loadCharacterIndustryJobs`.
  - **Still discarding `needsReauth` today:** Overview's _skills_ and _queue_ panels
    (`loadCharacterSkills`, `loadCharacterSkillQueue` in `src/features/skills/data.ts`, both
    plain `loadWithCache`) and Industry's _blueprints_ panel (`loadCharacterBlueprints` in
    `src/features/industry/data.ts`, `loadPaginatedWithCache`) — none of these expose
    `needsReauth`, so a narrower grant makes those three panels render `EmptyState`, not
    `ReauthBanner`. This is the real remaining shape of the gap the original teardown described
    as "six of nine views" — it is now three panels across two routes, not six routes.
- **The generalizable pattern exists and works, but has no shared name yet.** `loadWithCacheStatus`
  already takes `detectAuthFailure` / `skipCacheOnAuthFailure` (`src/esi/cache.ts`).
  `src/features/industry/jobs.ts`'s `loadCharacterIndustryJobs` uses the narrower 403-only
  detector precisely because "this login predates the scope" is a different condition from
  "offline" — its header comment is the design rationale, already written down. **Do NOT make
  that config the default.** `src/esi/cache.ts` documents the current default as deliberate:
  `needsReauth` must never short-circuit the cache read for a caller still on plain
  `loadWithCache`/`loadWithCache`-style loaders, or it would regress from stale-but-present to
  `null`. The correct shape is still a **named opt-in** (e.g. `SCOPE_GATED`) that each retrofitted
  caller passes explicitly — this does not yet exist as an exported constant; each of the three
  current adopters (`jobs.ts`, `wallet.ts`, `skills/data.ts`'s `...WithStatus` variants)
  re-derives the same object literal.
- **Nav already reflects scope gaps.** `src/app/useGrantedScopes.ts`'s `useLockedRoutes` computes,
  once per render, which nav paths the active Character currently lacks scope for (via
  `requiredScopesForRoute`), and `src/app/Layout.tsx` passes `locked={locked.has(path)}` to every
  `NavItem` in both the desktop rail and the mobile sheet. So the "gray out unavailable views"
  risk the original teardown flagged as an open decision is already resolved in code.
- **Scope state is structurally local already.** `setSyncedSetting` throws unless the key starts
  with `sync.` (`src/sync/planSync.ts`), and the sync push filter only collects
  `sync.`-prefixed, non-`sync.__` keys. A plain `db.settings.put({key: 'scopeSelection', ...})`
  is therefore _provably_ excluded from Firebase, not merely intended to be.

### Gap

1. `beginEveLogin` has no scope parameter and no UI to feed it.
2. No persistence of a per-character scope preference.
3. No presets/categories (target: 3 presets + 16 categories, sized to the ESI scope surface this
   app touches).
4. Three panels across two routes (Overview's skills + queue panels, Industry's blueprints panel)
   still cannot express "you didn't grant this" — see "Verified baseline" above. The five
   single-scope routes and the three other multi-scope-route panels already can.

### Argument: `sync.` setting or strictly local? — **strictly local.**

Scope grants are device/account _security_ state, not Editable Data. Three reasons:

1. **It would be a lie.** The synced value is a _preference_; the authoritative grant lives in
   the EVE SSO token on this device (`TokenRecord.scopes`). Syncing the preference to a device
   whose token has a different grant produces a UI claiming scopes the token doesn't have —
   worse than no sync.
2. **It pushes security posture across a trust boundary.** ADR 0001 constrains Firebase to
   Editable Data plus one short-lived access token. "Which permissions this user granted" is
   exactly the kind of account metadata that ADR is keeping out.
3. **A narrower grant on device B cannot be actioned remotely** — the fix is always an
   interactive re-auth on that device.

So: persist the _last picked_ selection as a **local, non-`sync.`-prefixed** `db.settings` key
(e.g. `scopeSelection:{characterId}`), and always render the picker's checked state from
`TokenRecord.scopes` (the truth) rather than the setting (the memory). Add a
`db.settings`-based e2e/unit assertion that the key never appears in a sync push — the prefix
guard in `planSync.ts` makes that assertion cheap.

### Engine vs UI split

Nothing in `src/engine`. Preset→scope-set expansion (`presetScopes(preset): Scope[]`) and
category→scope grouping are pure but ESI-shaped, so they belong in `src/esi/scopes.ts`
alongside `SCOPES`, unit-tested there. `src/engine` is for EVE domain math decoupled from ESI
(ARCHITECTURE §2) — an OAuth scope taxonomy is the opposite of decoupled.

### Files touched

- `src/esi/scopes.ts` / `src/esi/registry.ts` — restructure into scope _categories_ (label key +
  scopes + which app views it unlocks), plus presets (`minimal` / `recommended` / `everything`).
  `registry.ts` is the source of the scope set; `scopes.ts` should keep deriving `SCOPES` as the
  union of everything so existing callers and tests don't break.
- `src/app/loginFlow.ts` — `beginEveLogin(scopes?: Scope[])`, defaulting to `SCOPES`. Every
  existing `ReauthBanner` caller keeps working unchanged.
- `src/routes/Login.tsx` — add the picker (collapsed behind a "Choose permissions" disclosure;
  the primary button stays the SSO button — DESIGN §5's one-primary-per-view rule).
- `src/routes/Characters.tsx` — per-character "Permissions" affordance; this is where a
  _re-auth with different scopes_ naturally starts, and where a future "remove character"
  belongs (see 15a).
- `src/features/skills/data.ts` (`loadCharacterSkills`, `loadCharacterSkillQueue`) and
  `src/features/industry/data.ts` (`loadCharacterBlueprints`) — switch to a status-aware loader
  and surface `needsReauth`. This is the retrofit that remains: **three panels, not six views** —
  the five single-scope routes are already covered by `ScopeGate`.
- `src/routes/Overview.tsx` — render `ReauthBanner` for the skills and queue panels on
  `needsReauth` (the wallet panel already does this).
- `src/routes/Industry.tsx` — render `ReauthBanner` for the blueprints panel on `needsReauth`
  (`ActiveJobsPanel` already does this for jobs).

### New modules

- `src/features/auth/ScopePicker.tsx` — category checkbox list + preset selector; pure props in,
  `Scope[]` out. (Or `src/components/ui/` if the orchestrator decides it's a primitive; it isn't
  — it's feature-specific.)
- `src/features/auth/scopeSelection.ts` — local (non-synced) persistence of the last selection
  and reconciliation against `TokenRecord.scopes`.

### Shared primitives needed

- **A generalized "missing scope" load path.** Name it: make `jobs.ts`'s
  `{detectAuthFailure: 403-only, skipCacheOnAuthFailure: true}` config a named **opt-in** export
  from `src/esi/cache.ts` (e.g. `SCOPE_GATED`) so the three retrofitted callers don't each
  re-derive it. Opt-in, not default — `cache.ts` explains why changing the default would regress
  offline views.
- **`Checkbox`** — `src/components/ui/index.ts` still has no checkbox export. A 16-category
  picker needs one. Do not build a private one.
- **`CharacterAvatar`** — DESIGN §4 lists it planned (○); the per-character permissions UI on
  `Characters.tsx` wants it. Flag, don't build.

### Design tokens / components used

`Panel` (title = uppercase micro-heading, `text-xs font-semibold tracking-widest uppercase`),
hairline `border-line` separators between categories, `panel-2` fill for the category rows,
`accent` for checked state and focus ring (`outline-accent`), `text-dim` for the "what this
unlocks" sub-labels, `rounded-xs` throughout, control height `h-7`. One `primary` button (the
SSO submit); the preset switcher uses `Tabs` or `ghost` buttons, never a second primary. No
`DataAgeBadge` (not an API-derived view). No shadows (DESIGN §5 — shadows are popover-only).

### Tests

- `src/esi/scopes.test.ts` (extend) — presets expand to the expected sets; every category's
  scopes are a subset of `SCOPES`; the union of all categories equals `SCOPES` (this is the
  guarantee that a newly added scope cannot be invisible in the picker); no duplicates across
  categories. **This test is what makes the 13/16/20 batch safe.**
- `src/features/auth/scopeSelection.test.ts` — selection persists locally; the key is _not_
  `sync.`-prefixed (assert `setSyncedSetting` would reject it).
- `src/features/auth/ScopePicker.test.tsx` — preset selection toggles categories; deselecting
  every category disables submit; keyboard/`aria` semantics.
- `src/routes/Overview.test.tsx`, `src/routes/Industry.test.tsx` — a 403 on the skills/queue/
  blueprints panels renders `ReauthBanner`, not `EmptyState`. `src/features/skills/data.test.ts`
  and `src/features/industry/jobs.test.ts` are the existing templates for the underlying
  status-aware loader tests.
- Regression guard: a view _not_ using `SCOPE_GATED` still falls back to stale cache on a 403
  (locks in `cache.ts`'s decision so a future retrofit doesn't flip the default).
- E2E: `e2e/support/mockSso.ts` currently hardcodes `scp: [...SCOPES]`; parameterize it to echo
  the _requested_ `scope` query param so a spec can drive a narrow grant and assert the
  remaining panels degrade to `ReauthBanner`.

### i18n keys

`login.choosePermissions`, `login.permissionsHint`, `scopes.preset.minimal`,
`scopes.preset.recommended`, `scopes.preset.everything`, `scopes.category.<n>` ×16 (labels),
`scopes.categoryHint.<n>` ×16 ("unlocks the Wallet view"), `scopes.required`,
`scopes.selectedCount`, `characters.permissions`, `characters.permissionsChange`,
plus `overview.reauth{Title,Hint,Action}` for the two Overview panels still missing them and
`industry.reauth{Title,Hint,Action}` for the blueprints panel (mirroring the existing
`skills.reauth*` / `wallet.reauth*` keys, and the per-route-namespace keys `routeScopes.ts`
already expects for the five gated routes).

### Sync / Dexie impact

**No schema bump.** Selection is a plain `db.settings` row (the `settings` table exists since
`db.version(1)`). **No** push/pull mapping — deliberately non-`sync.`-prefixed, which the filter
in `planSync.ts` structurally excludes. Not a d90e417-class change; the argument for local-only
is above.

### New ESI scopes

None. 15b _narrows_ what is requested; it never adds.

### Cost

**S/M** — smaller than the original M estimate. The picker itself is small (`startLogin` already
takes an array); most of that work is restructuring `SCOPES`/`registry.ts` into 16 categories with
labels and "what this unlocks" copy. The degradation retrofit is now three panels across two
routes, not six views — the five single-scope routes are already handled structurally by
`ScopeGate`. If the orchestrator wants to cut scope further, the three-panel retrofit has
standalone value even without a picker, because item 15a's purge and the 13/16/20 batch both
produce exactly the "narrower grant than the app expects" state today.

### Depends on

- **15a** — should land first (independent privacy fix; also, a picker that lets a user drop a
  scope without purging its cache actively _creates_ the privacy bug). 15a has shipped.
- **Items 13, 16, 20** — should land _before_ 15b (see cross-cutting note).
- The three-panel degradation retrofit is a prerequisite for 15b being honest, whether it's
  tracked here or split out.

### Risks / open questions

- **16 categories is a lot of UI for a login screen.** Recommend: presets front and center,
  categories behind a disclosure, default = "recommended" (= today's `SCOPES`), so the common
  path is unchanged.
- **`ReauthBanner` copy is per-caller already**, not a shared string — every call site passes its
  own `title`/`hint`/`actionLabel` (and `routeScopes.ts` names a whole i18n namespace per gated
  route), so the "never granted" vs. "log in again" distinction can already be worded per view
  without a new `variant`. Just remember to write it that way for the three panels above.
- **Interaction with item 17.** A scope-revoke and a scope-gated 403 are exactly the events the
  activity log should carry. Coordinate the event kinds.

---

## Item 17 — Activity log

**Artifact claim:** "We have the signals, nowhere to put them. `esi/cache.ts` already knows
every fetch outcome and re-auth state. A log makes 'why is this data old?' answerable without
opening devtools."

**Verdict:** PARTIALLY TRUE — `cache.ts` knows the _cache_ outcomes (`src/esi/cache.ts:74-94`)
but **not** the rate-limit retry, which happens one layer down and is invisible to it
(`src/esi/client.ts:167-170`). A third signal is lost in a third file. The claim understates
the wiring: the emitter needs **two or three** call sites, not one.

### Verified baseline — exact outcome points

| #   | Site                         | Outcome                                                                          | Visible to `cache.ts`?                            |
| --- | ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `src/esi/cache.ts:74-81`     | live hit; row written to `esiCache`                                              | yes                                               |
| 2   | `src/esi/cache.ts:83-86`     | auth failure detected (incl. the `skipCacheOnAuthFailure` early return at `:85`) | yes                                               |
| 3   | `src/esi/cache.ts:87-88`     | non-auth failure (offline / 5xx / timeout) — silently falls through              | yes                                               |
| 4   | `src/esi/cache.ts:89-90`     | total miss: live failed **and** no cached row → `null`                           | yes                                               |
| 5   | `src/esi/cache.ts:91-94`     | cache fallback served (`fromCache: true`)                                        | yes                                               |
| 6   | `src/esi/client.ts:167-170`  | 429/420 → single retry after `retryWaitMs` (`:96-104`)                           | **no**                                            |
| 7   | `src/esi/client.ts:180`      | non-2xx throw (`errorFromResponse`, `:120-137`)                                  | only as a caught error, status already lost by #3 |
| 8   | `src/esi/paginated.ts:19-26` | mid-pagination 404 → `break`, **partial data silently returned as complete**     | **no** — nothing anywhere surfaces this           |

Site 8 is the strongest single argument for the feature: a user can be looking at a truncated
asset list with a fresh `DataAgeBadge` and no indication anywhere in the app. `esiCache` even
persists the truncated array.

Also note `client.ts:79-88` (`buildUrl`) folds query params into the URL, and several routes
carry ids in the path itself (`/characters/{id}/mail/{mailId}` at `endpoints.ts:402`,
`/characters/{id}/calendar/{eventId}` at `:489`). The built URL is therefore _never_ a safe
log field. See below.

### Gap

Everything. No emitter, no buffer, no UI, no bell.

### SECURITY — event shape (the critical recommendation)

CLAUDE.md: "Refresh tokens live in Dexie only. Never send them to Firebase or logs." An
activity log is a log, so the type must make leaking structurally impossible rather than
merely discouraged.

**Rule: a closed discriminated union whose every field is a number, a boolean, or a
literal-union route template. No `string` field that ever originates outside this repo. Never
`details: unknown`.**

```ts
// src/esi/activityLog.ts

/** Route TEMPLATES, not URLs. Ids are never interpolated in. */
export type EsiRoute =
  | '/characters/{id}/skills'
  | '/characters/{id}/skillqueue'
  | '/characters/{id}/wallet'
  | '/characters/{id}/wallet/journal'
  | '/characters/{id}/mail'
  | '/characters/{id}/mail/{mail_id}';

// ...one literal per wrapper in endpoints.ts
export type ActivityEvent =
  | { kind: 'fetch.live'; route: EsiRoute; characterId: number | null; at: number }
  | {
      kind: 'fetch.stale';
      route: EsiRoute;
      characterId: number | null;
      at: number;
      cacheAgeMs: number;
    }
  | { kind: 'fetch.miss'; route: EsiRoute; characterId: number | null; at: number }
  | {
      kind: 'fetch.throttled';
      route: EsiRoute;
      characterId: number | null;
      at: number;
      status: 429 | 420;
      waitMs: number;
    }
  | {
      kind: 'fetch.failed';
      route: EsiRoute;
      characterId: number | null;
      at: number;
      status: number;
    }
  | {
      kind: 'fetch.partial';
      route: EsiRoute;
      characterId: number | null;
      at: number;
      pagesFetched: number;
    }
  | {
      kind: 'auth.reauth';
      route: EsiRoute;
      characterId: number | null;
      at: number;
      status: 401 | 403;
    }
  | { kind: 'auth.recovered'; route: EsiRoute; characterId: number | null; at: number }
  | { kind: 'scope.revoked'; characterId: number; at: number; revokedCount: number };
```

**Explicitly forbidden, with the reason each one is a real leak vector here:**

| Never in an event                                   | Why                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token, refresh token, `Authorization` header | CLAUDE.md; `client.ts:162` builds the header — it must not be within reach of the emitter's argument list                                                                                   |
| The built `URL` or `url.search`                     | `buildUrl` (`client.ts:79-88`) folds query params in; path ids leak too (`mail/{mailId}`)                                                                                                   |
| `EsiError.message`                                  | **Not obviously unsafe, but it is:** `errorFromResponse` (`client.ts:120-137`) lifts it from the response body's `error` field — a server-controlled response-body fragment. `status` only. |
| `EsiError.body`                                     | Raw response body                                                                                                                                                                           |
| Any response payload                                | Mail subjects/bodies, wallet journal, contract counterparties, asset locations                                                                                                              |
| Character _name_                                    | `characterId` is enough; the UI resolves the name at render from `db.characters`                                                                                                            |
| `details: unknown` / `Record<string, unknown>`      | The escape hatch that makes every rule above unenforceable                                                                                                                                  |

**Rendering rule that closes the last hole:** one i18n key per `kind`
(`t('activity.' + event.kind, { route: t('activity.route.' + event.route), status })`). Because
`route` is a literal union and every other field is a number, **no server-supplied string can
reach the DOM at all**, even by accident.

**Leak-canary test (name it, make it a gate):** drive an msw-mocked run through success, 403,
429-retry, 500, and offline, with the access token set to a distinctive sentinel and mocked
response bodies containing a sentinel string; then `JSON.stringify(getActivityLog())` and
assert neither sentinel appears, and that every value in the serialized buffer is a number,
boolean, or a member of `EsiRoute` ∪ the `kind` union. This catches a future contributor adding
a "just for debugging" field.

### Ring buffer: in-memory, 200 entries — **not** persisted

Argument:

1. **It is diagnostic device state, not Editable Data** (CONTEXT.md). It must never sync
   (`planSync.ts:436` excludes it automatically as long as it isn't a `sync.` setting — and
   it's not a setting at all).
2. **Persisting it is user data at rest on a shared machine.** The log records that a character
   read mail at a time, from this browser profile, surviving reboot. That is precisely the
   category CLAUDE.md's "never in logs" rule exists to protect, and IndexedDB is not encrypted.
   Given the app has **no logout path at all** (see 15a), there would be no way to clear it.
3. **It answers a live question.** "Why is this data old _right now_" is a session question;
   `DataAgeBadge` already covers cross-session staleness (DESIGN §4, required on every
   API-derived view).
4. **Cost.** Persisting means `db.version(4)` + a table + retention policy + a clear-on-logout
   path that doesn't exist. In-memory means zero Dexie impact.

Consequence to accept explicitly: the log is empty after a reload (including after the PWA
update prompt, `src/app/ReloadPrompt.tsx`). That's fine — it survives route navigation because
the module is a singleton, which is the window that matters.

### Emitter — placement and layering

**`src/esi/activityLog.ts`.** It must **not** live in `src/app`: ARCHITECTURE §2 records
`src/app` as "Imported by: `main.tsx` only", so an `src/esi` → `src/app` import inverts the
layering. `src/esi` is already imported by every data module, and the log has no dependencies
of its own — it imports nothing but its own types. `src/app` subscribes downward, which is the
allowed direction. No cycle: `activityLog.ts` imports neither `cache.ts` nor `client.ts`.

Interface, mirroring the existing `subscribeSyncStatus` precedent (`src/sync/planSync.ts:117,
126-131`) so there's one observable idiom in the codebase:

```ts
export function recordActivity(event: ActivityEvent): void;
export function getActivityLog(): readonly ActivityEntry[]; // newest first
export function subscribeActivityLog(fn: (entries: readonly ActivityEntry[]) => void): () => void;
export function clearActivityLog(): void; // bell menu action
export function markActivityRead(): void; // unread dot
```

Call sites: `cache.ts` for #1-#5, `client.ts` for #6 (the retry, invisible above) and #7's
status, `paginated.ts:24` for #8. Keep `src/engine` entirely out of it — engine forbids
non-pure imports and this is ESI plumbing, not domain math.

**Route plumbing:** the emitter needs the route _template_, and this is easier than it was when
this brief was first written. `src/esi/registry.ts`'s `ESI_REGISTRY` already carries a `route`
field per endpoint — today it's read only by `registry.test.ts` to pin it against `endpoints.ts`'s
marker comments (its own docstring says so explicitly: "The `route` template has no runtime
consumer"). Item 17 is the first runtime consumer: thread the endpoint id (or its registry entry)
into `esiFetch`/`loadWithCache`/`loadPaginatedWithCache` alongside the path, and derive the route
template from `ESI_REGISTRY[id].route` at the call site instead of adding a new field anywhere.
No second registry needed — just a new import from a type-only reference to a runtime one.

### Noise filtering — pure, unit-testable

```ts
// src/esi/activityBuffer.ts  (pure: no Dexie/fetch/DOM)
export interface ActivityEntry {
  readonly event: ActivityEvent;
  readonly count: number; // 1 = single occurrence
  readonly firstAt: number;
  readonly lastAt: number;
}
export function appendActivity(
  buffer: readonly ActivityEntry[],
  event: ActivityEvent,
  opts?: { windowMs?: number; max?: number } // defaults 60_000 / 200
): readonly ActivityEntry[];
```

Rule: coalescing key = `(kind, route, characterId)`. Scan the buffer for the most recent entry
with a matching key whose `lastAt` is within `windowMs`; if found, increment `count`, set
`lastAt`, and move it to the head. Otherwise unshift and `slice(0, max)`.

**Scan, don't just check the head.** A refresh cycle fans out across ~8 endpoints, so failures
arrive interleaved (A,B,C,A,B,C); head-only comparison would coalesce nothing, which is exactly
the "one broken endpoint writes a hundred lines" failure the feature exists to prevent. 200
entries makes the scan free.

Pure and deterministic (`at` comes from the event, never `Date.now()` inside), so it is fully
unit-testable — which is why it's a separate file from the stateful emitter.

Placement note: this is pure logic but it does **not** go in `src/engine`. ARCHITECTURE §2
defines engine as EVE domain calculation decoupled from SDE/ESI; a reducer keyed on ESI route
templates is definitionally ESI-coupled. Colocated in `src/esi/` with its own `.test.ts` gets
the same testability with correct layering.

### Engine vs UI split

- `src/engine`: **nothing** (justified above).
- `src/esi/activityBuffer.ts`: pure coalescing reducer (unit-tested, no I/O).
- `src/esi/activityLog.ts`: singleton buffer + subscribe (module state, no I/O).
- `src/app/ActivityBell.tsx` + `src/app/useActivityLog.ts`: UI, mirroring
  `SyncStatusDot.tsx` / `useSyncStatus.ts` exactly.

### Files touched

- `src/esi/cache.ts` — emit at `:74-81`, `:83-86`, `:87-88`, `:89-90`, `:91-94`. Needs the
  route template threaded through (see above).
- `src/esi/client.ts` — emit at `:167-170` (throttled, with `waitMs` from `retryWaitMs`) and at
  `:180` (failed, **status only**, never `message`/`body`).
- `src/esi/paginated.ts:19-26` — emit `fetch.partial` on the swallowed 404 instead of silently
  breaking.
- `src/app/Layout.tsx:149` — bell beside `SyncStatusIndicator` in the desktop rail header.
  The mobile bottom bar is full at 4 primary + More (`:212-239`), so the bell goes into
  `MobileMoreSheet` (`:49-110`) as a labelled row, not a fifth tab.
- `src/i18n/locales/en.json` — new `activity` namespace.
- `src/auth/session.ts` — emit `scope.revoked` from the 15a hook (couples 17 to 15a; small).

### New modules

- `src/esi/activityLog.ts` — singleton ring buffer + `recordActivity`/`subscribe`; the typed
  event union lives here.
- `src/esi/activityBuffer.ts` — pure `appendActivity` coalescing reducer.
- `src/app/useActivityLog.ts` — React subscription hook (mirror of `useSyncStatus.ts`).
- `src/app/ActivityBell.tsx` — bell button + unread dot + popover list.

### Shared primitives needed

- **`Popover`** — `src/components/ui/` has none, and DESIGN §4 doesn't even list it as planned
  (○). DESIGN §5 explicitly reserves `shadow-lg shadow-black/50` for "popovers/menus", so the
  design system anticipates one that was never built. The nearest existing thing is
  `MobileMoreSheet` (`Layout.tsx:49-110`, a private mobile-only dialog) and `Tooltip`
  (hover/focus only, wrong semantics — needs click-to-open, Escape-to-close, focus trap,
  `aria-haspopup`). **Do not build a private one inside `ActivityBell`.** Assign ownership; the
  scope picker (15b) and a future character menu both want it too.
- **The route-template field already exists** on `ESI_REGISTRY` in `src/esi/registry.ts`; it
  just has no runtime consumer yet (see "Route plumbing" above). No new registry to build.
- **`Badge`/count affordance** — `StatChip` (`components/ui/StatChip.tsx`) can carry the "×12"
  coalesce count; confirm it renders at 11px inside a dense row before assuming.

### Design tokens / components used

- Bell trigger: `size-7`, `rounded-xs`, `text-text-dim` idle → `text-text` hover, unread dot
  `bg-accent size-1.5 rounded-full` (the only `rounded-full` allowance per DESIGN §3),
  `outline-accent` focus ring.
- Popover surface: `bg-panel` + `border border-line` + `rounded-xs` +
  **`shadow-lg shadow-black/50`** — DESIGN §5's single sanctioned shadow use. Everything else
  in the app uses background-step layering, so this must not leak into the rows.
- Header: uppercase micro-heading `text-[11px] font-semibold tracking-widest text-text-dim`,
  with a `ghost` "Clear" `Button` in the actions slot. **No `primary` button** — DESIGN §5
  allows one per view and the page underneath already has it.
- Rows: `px-3 py-1.5` density, hairline `border-line` separators, `panel-2` on hover.
  Timestamp `text-text-dim tabular-nums` right-aligned. Coalesce count as a `StatChip`.
- Tone by kind: `fetch.live` → `success`, `fetch.stale`/`fetch.throttled`/`fetch.partial` →
  `warning`, `fetch.failed`/`auth.reauth` → `danger`. Never tone alone — every row carries a
  word (DESIGN §6: "color never the sole signal").
- **No `DataAgeBadge`.** DESIGN §5 requires it on API-derived views; the activity log is
  meta-view about freshness, not an API-derived view itself. Each row's own timestamp is the
  age signal.
- `EmptyState` when the buffer is empty ("nothing to report" is a good state, and DESIGN §4
  forbids a bare empty list).

### Tests

- `src/esi/activityBuffer.test.ts` (pure, the main behavioural suite) — coalesces same
  kind+route+character inside the window; does **not** coalesce across different routes;
  **does** coalesce interleaved bursts (the A,B,A,B case — this is the regression that head-only
  matching would miss); a matching event outside `windowMs` appends a new entry; buffer caps at
  200 and drops oldest; `count`/`firstAt`/`lastAt` are correct after N merges; the input buffer
  is never mutated.
- `src/esi/activityLog.test.ts` — subscribe fires immediately with current state (matching
  `subscribeSyncStatus`'s contract at `planSync.ts:126-131`); unsubscribe stops delivery;
  `clearActivityLog` empties and notifies.
- **`src/esi/activityLog.security.test.ts` — the leak canary described above. Treat this as the
  acceptance test for the whole item.**
- `src/esi/cache.test.ts` (extend) — each of outcome points 1-5 emits exactly one event of the
  right kind (existing suite at `cache.test.ts:72,123` already builds 403 scenarios to reuse).
- `src/esi/client.test.ts` (extend) — 429 and 420 each emit `fetch.throttled` with the capped
  `waitMs`; a 500 emits `fetch.failed` with `status: 500` and **no message field**.
- `src/esi/paginated.test.ts` (extend) — the mid-pagination 404 emits `fetch.partial`.
- `src/app/ActivityBell.test.tsx` — unread dot appears on a new event and clears on open;
  Escape closes and returns focus (the `Layout.tsx:124-133` pattern); coalesced rows render
  "×N".
- E2E `e2e/activity.spec.ts` — make `mockEsi` return 500 for the wallet endpoint on a repeated
  poll; assert the bell shows one row with a count, not many rows. Requires a failure-injection
  helper in `e2e/support/mockEsi.ts`.

### i18n keys

Namespace `activity`: `activity.title`, `activity.open`, `activity.empty`, `activity.emptyHint`,
`activity.clear`, `activity.count` (`"×{{count}}"`), `activity.unread`;
one per kind — `activity.kind.fetchLive`, `.fetchStale`, `.fetchMiss`, `.fetchThrottled`,
`.fetchFailed`, `.fetchPartial`, `.authReauth`, `.authRecovered`, `.scopeRevoked`;
one per route template — `activity.route.<n>` (~25, matching `endpoints.ts`'s wrappers). The
per-route keys are what keep server strings out of the DOM; they are not optional polish.

### Sync / Dexie impact

**None.** In-memory only: no `db.version(4)` bump, no new table, no push/pull mapping in
`src/sync/`. The log is API-derived/device state, explicitly **not** Editable Data (CONTEXT.md),
and must never reach Firebase — which is structurally guaranteed here because it never touches
`db.settings` at all, so `planSync.ts:436`'s `sync.`-prefix filter is never even in play.
Stating this plainly because the shared spec flags d90e417 as a known past miss: this item has
no sync surface by construction.

### New ESI scopes

None.

### Cost

**M** — confirmed. The emitter + pure buffer is a couple of days. The rest is the `Popover`
primitive (if 17 owns it), ~35 i18n keys, the route-template plumbing through `esiFetch`, and
the security test. If `Popover` and the route registry are assigned elsewhere, 17 drops to
**S/M**.

### Depends on

- **`src/esi/registry.ts` already has the route field** — 17 needs it wired into
  `cache.ts`/`client.ts`/`paginated.ts` at runtime, which it isn't today (see "Route plumbing"
  above). This is smaller than the original estimate: no registry to design, just a new call-site
  parameter (the endpoint id) threaded through `esiFetch` and friends, from which the route
  template is looked up. If item 15a-ii (the blunt→surgical cache-purge reversal, see
  `F-scopes-activity.md`'s Item 15a) also lands, both it and this item are extending the same
  `EsiEndpointSpec` shape — coordinate so `route`/`scope`/a future cache-key field don't get
  designed twice.
- **A `Popover` owner** — must be decided before 17 starts, or it will grow a private one.
- **15a** (soft) — supplies the `scope.revoked` event; 17 works without it.

### Risks / open questions

- **Threading the route template through `esiFetch` touches ~25 wrappers.** That mechanical
  change is the real cost driver and is shared with 15a-ii. Decide the shape once.
- **Volume.** With a poll loop across 8+ endpoints, even the success events will dominate the
  buffer. Consider: log `fetch.live` only when it _follows_ a failure (a "recovery"), and
  otherwise log only non-happy-path outcomes. Recommend this — it makes the log answer "what
  went wrong" rather than "what happened", which is the stated user question.
- **`characterId` in an in-memory log is fine; a _name_ is not.** Resolve names at render from
  `db.characters` so the buffer stays id-only. If anyone proposes caching the name in the entry
  "for convenience", refuse it — that's how the shape erodes.
- **Unread state** is per-session; no persistence needed, consistent with the buffer decision.

---

## Cross-cutting note for the orchestrator — items 13, 16, 20 add scopes

Every added scope forces **all** characters to re-authorize (ARCHITECTURE §4). Design and
ordering implications:

1. ~~**15a must land BEFORE the 13/16/20 batch.**~~ **DONE.** 15a shipped: `persistTokens`
   (`src/auth/session.ts`) purges `esiCache` on any scope revoke, so a user who re-auths and
   declines one of the batch's new consent items no longer leaves stale cached data behind.
2. ~~**15a's diff must be additive-safe.**~~ **DONE and tested.** `revokedScopes`
   (`src/esi/scopes.ts`) purges only on removals; `src/auth/session.test.ts` names this case
   explicitly. Adding four scopes for items 13/16/20 is a no-op for the purge.
3. **15b must land AFTER the batch.** Its 16-category grouping, its labels, its
   "what this unlocks" copy and its `SCOPES`-union test all get redone when four scopes arrive.
   Building the picker first means building it twice.
4. ~~**Land the single-source-of-truth cleanup with the batch.**~~ **DONE.** The scope list is a
   single source of truth today: `src/esi/registry.ts`'s `ESI_REGISTRY` declares each endpoint's
   scope, `src/esi/scopes.ts`'s `SCOPES` derives from it, and `e2e/support/fixtureData.ts`
   re-exports `SCOPES` rather than re-listing it. Items 13/16/20 add their new scopes as
   `ESI_REGISTRY` entries for their new endpoint wrappers; `SCOPES` and the e2e fixture pick them
   up automatically — no second edit needed.
5. **The batch's degradation gap is smaller than it was.** `src/app/ScopeGate.tsx` +
   `src/app/routeScopes.ts` now gate `/assets`, `/mail`, `/calendar`, `/contracts`, `/orders`
   at the route level — before any fetch — so a missing scope on those five renders
   `ReauthBanner`, not empty. What's left: Overview's _skills_ and _queue_ panels
   (`src/features/skills/data.ts`'s `loadCharacterSkills`/`loadCharacterSkillQueue`) and
   Industry's _blueprints_ panel (`src/features/industry/data.ts`'s `loadCharacterBlueprints`)
   still use a plain, non-status-aware cache loader and so still discard `needsReauth` — three
   panels across two routes, not "six views." Every character on an old token will still 403 a
   newly-scoped endpoint on those three panels and render `EmptyState`. Whether or not 15b ships,
   retrofitting those three to a named **opt-in** status-aware config (matching
   `jobs.ts`'s `loadCharacterIndustryJobs`) is a prerequisite for the batch, not for the picker.
   Do not implement it by changing `loadWithCache`'s shared default — `src/esi/cache.ts` records
   why that would regress offline behavior for every other caller.
6. **"One registry, two consumers" is mostly built.** `src/esi/registry.ts`'s `ESI_REGISTRY`
   already carries both `scope` and `route` per entry, and `scopes.ts` / `routeScopes.ts` already
   derive from it at runtime. What item 17 still needs is a **runtime** (not type-only) consumer
   of the `route` field inside `cache.ts`/`client.ts`/`paginated.ts` — see Item 17's "Route
   plumbing" above, which no longer needs a _new_ registry, just a new import path into an
   existing one.
