# Brief F — Scopes & Activity (items 15a, 15b, 17)

Area: `src/auth/`, `src/esi/{scopes,client,cache}.ts`, `src/components/ui/ReauthBanner.tsx`,
`src/db/index.ts`. Read-only investigation; nothing in the repo was modified.

---

## Item 15a — Cache purge on scope revoke (privacy fix)

**Artifact claim:** "Half done. `ReauthBanner` and `isAuthFailure` cover the failure path.
Missing: choosing scopes at login, and purging `esiCache` on revoke. Do the purge even if the
picker waits — stale data behind a revoked scope is a privacy bug."

**Verdict:** CONFIRMED — the failure path exists (`src/esi/client.ts:62-65`,
`src/components/ui/ReauthBanner.tsx:16`); the revoke path does not exist at all. Granted scopes
are persisted (`src/db/index.ts:22`, written at `src/auth/session.ts:68`) but **nothing in
`src/` ever reads them back** — a repo-wide grep for `scope` returns only the declaration, the
write, and test fixtures. There is no diff, no purge, and no logout.

### Verified baseline

- **Scopes are decoded correctly.** `decodeAccessToken` reads the JWT `scp` claim and
  normalizes string-or-array to `string[]` (`src/auth/jwt.ts:37-38,45`). Covered by
  `src/auth/jwt.test.ts:29-40`.
- **Correction to the task's premise:** the granted scope set lives on **`TokenRecord`**
  (`src/db/index.ts:16-23`, field `scopes: string[]`), **not** on `CharacterRecord`
  (`src/db/index.ts:6-12`, which is only `characterId`/`name`/`ownerHash`/`addedAt`).
- **Never compared across logins.** `persistTokens` already reads the prior state it would
  need — `existing` character at `src/auth/session.ts:46` and `previous` token record at
  `:47` — then blindly overwrites `scopes` at `:68`. The old set is discarded unread.
- **`persistTokens` is the single funnel and it is called twice**: from `completeLogin`
  (`src/auth/session.ts:87`) and from the refresh path inside `getValidAccessToken`
  (`src/auth/session.ts:115`). A hook placed in `routes/Callback.tsx` would miss the refresh
  path — refresh grants also carry a fresh JWT whose `scp` reflects a revocation made in the
  EVE account portal.
- **No endpoint → scope mapping exists anywhere.** `src/esi/endpoints.ts` (629 lines, ~25
  wrappers) declares zero scope metadata; wrappers pass raw path strings to `esiFetch`
  (e.g. `src/esi/endpoints.ts:36,60,133,378,624`). `src/esi/scopes.ts` is a flat 11-element
  list with no structure (`src/esi/scopes.ts:6-18`).
- **The scope list is already duplicated three times and has already drifted.**
  `src/esi/scopes.ts:6-18` (11 scopes) · `src/esi/scopes.test.ts:5-21` hardcodes the same 11 ·
  `e2e/support/fixtureData.ts:21-31` lists only **10** — it is missing
  `esi-industry.read_character_jobs.v1`. That drift is the empirical argument for a single
  source of truth rather than a comment.
- **Cache-key inventory (all character-scoped keys today):** `skills`, `attributes`,
  `implants`, `skillqueue` (`src/features/skills/data.ts:29-34`); `wallet:balance`,
  `wallet:journal`, `wallet:transactions` (`src/features/character/wallet.ts:16-20`);
  `assets` (`assets.ts:5`); `mail:headers`, `mail:{mailId}` (`mail.ts:10-13`);
  `calendar`, `calendar:{eventId}` (`calendar.ts:10-13`); `contracts` (`contracts.ts:5`);
  `orders`, `orders:history` (`orders.ts:10-13`); `blueprints`
  (`src/features/industry/data.ts:5`); `industryJobs` (`src/features/industry/jobs.ts:19`).
- **Global (public) keys — confirmed must NOT be purged:** `name:{id}`
  (`src/features/character/names.ts:9-10`), `type:{id}`
  (`src/features/character/typeNames.ts:51-52`, also `src/features/skills/data.ts:97`),
  `station:{id}` (`src/features/character/stations.ts:10-11`). All written under
  `GLOBAL_CACHE_CHARACTER_ID = 0` (`src/esi/cache.ts:32`). These are public universe data
  behind no scope; purging them is pure cache churn with zero privacy benefit. A
  `characterId !== GLOBAL_CACHE_CHARACTER_ID` guard is sufficient and must be asserted by test.
- **No full-purge path to reuse — there is no logout at all.** Grep for
  `db.characters.delete` / `db.tokens.delete` / `esiCache.clear` finds nothing.
  `src/routes/Characters.tsx` only lists and switches (`:16,25-28`); there is no remove button.
- **Second instance of the same privacy bug, same class, same primitive:**
  `handleOwnerHashChange` (`src/sync/planSync.ts:253-263`) wipes `skillPlans` and `buildPlans`
  when a character's `ownerHash` changes (sold/transferred) but leaves `esiCache` intact — the
  previous owner's cached wallet balance, journal, mail headers, mail bodies, assets and
  contracts survive into the new owner's session.

### Gap

1. No scope diff on login/refresh.
2. No purge primitive on `esiCache`.
3. No key→scope mapping, and no mechanism that would force a new endpoint to declare one.
4. `handleOwnerHashChange` does not purge API-derived cache.
5. No logout/character-removal, so no place a purge would otherwise already live.

### Recommended shape — ship in two moves

**15a-i (ship first, days):** blunt purge. On any _removal_ from the granted scope set for a
character, delete **every** `esiCache` row for that `characterId`, sparing
`GLOBAL_CACHE_CHARACTER_ID`. Justification: `esiCache` is 100% re-derivable API-derived data
(CONTEXT.md), so the entire cost of over-purging is one refetch, while the cost of
under-purging is a privacy bug. This needs **no** key→scope mapping and can land this week.

**15a-ii (follow-up):** make the purge surgical _and_ make the mapping unforgeable.

Mechanism recommendation (concrete, type-level, better than a comment): stop passing bare
strings into the cache. Introduce a cache-key registry whose entries carry the scope, and
change the `esi/cache` signatures to accept only registry-derived keys:

```ts
// src/esi/cacheKeys.ts
export interface CacheKeySpec {
  readonly prefix: string;
  readonly scope: Scope | null;
}
export interface CacheKey {
  readonly key: string;
  readonly scope: Scope | null;
}
export const CACHE_KEYS = {
  walletJournal: { prefix: 'wallet:journal', scope: 'esi-wallet.read_character_wallet.v1' },
  mailBody: { prefix: 'mail:', scope: 'esi-mail.read_mail.v1' },
  typeName: { prefix: 'type:', scope: null }, // public → global sentinel only
  // ...
} as const satisfies Record<string, CacheKeySpec>;
```

`loadWithCache`/`loadWithCacheStatus`/`readCached`/`writeCached` take a `CacheKey`, not a
`string`. A new ESI-backed view then _cannot_ write a cache row without naming its scope — the
compiler rejects it. Purge becomes: revoked scope → matching prefixes → range-delete.
Note the mapping must be **prefix→scope, not exact-key→scope**: `mail:{id}`, `calendar:{id}`,
`type:{id}` are key _families_.

Backstop test (cheap, catches the drift that already happened): assert every `Scope` in
`SCOPES` is referenced by at least one `CACHE_KEYS` entry and vice versa, and make
`e2e/support/fixtureData.ts` import `SCOPES` from `src/esi/scopes.ts` instead of re-listing it.

**Dexie mechanics for the purge (non-obvious):** the only index is the compound
`[characterId+key]` (`src/db/index.ts:103,112`) — there is no standalone `characterId` index.
Range-delete is therefore required:

```ts
db.esiCache
  .where('[characterId+key]')
  .between([characterId, Dexie.minKey], [characterId, Dexie.maxKey])
  .delete();
```

**Diff semantics (easy to get wrong when the 13/16/20 batch lands):** only _removals_ trigger a
purge. `previous ⊄ next` → purge; `previous ⊂ next` (scopes added) → **no-op**. Adding four new
scopes must not nuke every character's cache. This deserves its own named test.

### Engine vs UI split

Nothing goes in `src/engine`. The scope diff is a two-line set operation with no domain
meaning, and the purge is inherently Dexie I/O — `src/engine` forbids Dexie imports
(CLAUDE.md, ARCHITECTURE §2). The one genuinely pure piece is
`revokedScopes(previous, next): Scope[]`; it belongs colocated in `src/esi/scopes.ts` (pure,
no imports) and is unit-tested there. `src/auth/` is TDD-required per CLAUDE.md, so the
`persistTokens` hook is failing-test-first regardless.

### Files touched

- `src/auth/session.ts` — in `persistTokens` (`:44-71`), compute `revokedScopes(previous?.scopes
?? [], decoded.scopes)` **before** the `db.tokens.put` at `:63`, and call the purge when
  non-empty. Placing it here covers both `completeLogin` (`:87`) and the refresh path (`:115`).
- `src/esi/cache.ts` — export `purgeCharacterCache(characterId, scopes?)`; must guard
  `GLOBAL_CACHE_CHARACTER_ID`. (15a-ii: signature change from `string` key to `CacheKey`.)
- `src/esi/scopes.ts` — add pure `revokedScopes()`; 15a-ii adds the prefix→scope registry (or a
  new `cacheKeys.ts`, see below).
- `src/sync/planSync.ts:253-263` — add the `esiCache` purge to `handleOwnerHashChange`. Same
  primitive, same bug class; do not let this ship separately.
- `e2e/support/fixtureData.ts:21-31` — import `SCOPES` rather than re-listing (kills the
  existing drift).
- 15a-ii only: every `features/*` data module listed in the key inventory above, mechanically,
  to pass `CACHE_KEYS.x` instead of a string literal.

### New modules

- `src/esi/cacheKeys.ts` — registry of cache-key families with their required scope; the
  single place a new ESI-backed view declares what scope its cached data sits behind.
  (15a-ii only; 15a-i needs no new file.)

### Shared primitives needed

- **`purgeCharacterCache(characterId)`** in `src/esi/cache.ts` — one purge primitive with three
  callers: scope revoke, ownerHash change, and a future "remove character"/logout. Orchestrator
  should assign it to whoever lands 15a-i first and forbid a second copy.
- **A single `SCOPES` source of truth** consumed by `loginFlow`, `scopes.test.ts` and the e2e
  fixture. Currently three copies, already drifted.

### Design tokens / components used

None — 15a is entirely non-visual. It does not change what `ReauthBanner` renders. (Purging on
revoke makes existing views fall to `EmptyState`/`ReauthBanner` naturally, which is correct.)

### Tests

TDD-required (`src/auth`, CLAUDE.md):

- `src/esi/scopes.test.ts` — `revokedScopes`: pure, order-independent, empty on additive diff,
  empty on identical sets, returns only removals on a mixed add+remove diff.
- `src/auth/session.test.ts` — re-login with a **narrower** scope set purges that character's
  `esiCache` rows; re-login with a **wider** set purges nothing; a token _refresh_ whose JWT
  has fewer scopes also purges (guards the `:115` path); another character's rows are
  untouched; `GLOBAL_CACHE_CHARACTER_ID` rows survive (this is the privacy-vs-churn assertion,
  name it explicitly).
- `src/esi/cache.test.ts` — `purgeCharacterCache` range-delete correctness across the compound
  index, including a character whose id sorts adjacent to another's.
- `src/sync/planSync.test.ts` — ownerHash change purges `esiCache` alongside plans.
- 15a-ii: registry completeness test (every `Scope` mapped, every mapped prefix a real `Scope`).

No e2e needed; this is invisible in the UI by design.

### i18n keys

None. If the orchestrator wants the revoke surfaced to the user (recommended as part of item
17, not here): `activity.scopeRevoked`.

### Sync / Dexie impact

**None.** No schema bump, no push/pull mapping. `TokenRecord.scopes` already exists
(`src/db/index.ts:22`) and `esiCache` is API-derived and never synced (CONTEXT.md;
`src/db/index.ts:48-52`). This is _not_ a d90e417-class change — flagging explicitly because
the shared spec warns about missing that pattern.

### New ESI scopes

None.

### Cost

**S** (revised down from the teardown's M for this half). 15a-i is a day or two including
tests. 15a-ii (registry + mechanical call-site migration across ~12 data modules) is a further
few days — call the pair **S/M**. The teardown's M covered 15a+15b together.

### Depends on

Nothing. Deliberately: this is an independent privacy fix and must not be blocked behind 15b
or behind items 13/16/20.

### Risks / open questions

- **Blunt vs. surgical.** Orchestrator decision: does 15a-i (purge everything character-scoped)
  ship alone, or wait for the registry? Recommendation: ship 15a-i now. The only downside is
  one refetch.
- **Unmapped keys under 15a-ii.** When a key doesn't match any registry prefix, the fail-safe
  default must be _purge_, not _keep_. Decide and encode it.
- **Revoked-and-nothing-else.** If a user revokes a scope in the EVE portal without re-logging
  in, the next _refresh_ JWT carries the narrower `scp` — that path is covered by hooking
  `persistTokens`, which is why the hook placement matters more than it looks.
- **`GLOBAL_CACHE_CHARACTER_ID = 0` is a real-looking characterId.** No EVE character has id 0,
  so it is safe, but the purge guard must be explicit rather than incidental.

---

## Item 15b — Scope picker at login

**Artifact claim:** (same teardown quote) "...Missing: choosing scopes at login..."

**Verdict:** CONFIRMED — `SCOPES` is a single fixed `as const` list (`src/esi/scopes.ts:6-18`),
spread wholesale into `startLogin` with no user input (`src/app/loginFlow.ts:7`). There is no
scope UI anywhere and no settings route.

### Verified baseline

- `beginEveLogin()` is three lines: `assignLocation(await startLogin([...SCOPES]))`
  (`src/app/loginFlow.ts:6-8`). It takes no arguments and is called from `Login.tsx:12`,
  `Characters.tsx:42`, and every `ReauthBanner` `onLogin`.
- `startLogin(scopes: string[], config?)` **already accepts an arbitrary scope array**
  (`src/auth/session.ts:29`) and joins it into the authorize URL (`src/auth/sso.ts:39`). The
  auth layer needs no change — only the caller does.
- **Degradation today is uneven, and this is the real cost of 15b.** `ReauthBanner` is wired in
  exactly **3 of 9** ESI-backed views: `src/features/industry/ActiveJobsPanel.tsx:90`,
  `src/routes/Wallet.tsx:136`, `src/routes/Skills.tsx:198`. Assets, Mail, Calendar, Contracts,
  Orders **and Overview** all call `loadWithCache`, which **discards** `needsReauth`
  (`src/esi/cache.ts:98-104` returns only `.cached`). With a narrower grant those six views
  render as _empty_, indistinguishable from "you own nothing", with no path back to re-auth.
- **Overview is the easiest one to miss.** `src/routes/Overview.tsx:16,52` imports the
  `loadWithCache` variant `loadWalletBalance` (`src/features/character/wallet.ts:23-30`), even
  though a status-aware sibling `loadWalletBalanceWithStatus` already exists five lines below
  (`wallet.ts:37-43`) and is used by `Wallet.tsx`. Overview therefore degrades to
  `EmptyState` (`Overview.tsx:145`) with no re-auth affordance. It is a one-line swap — the
  cheapest of the six.
- **The generalizable pattern exists and works.** `loadWithCacheStatus` already takes
  `detectAuthFailure` / `skipCacheOnAuthFailure` (`src/esi/cache.ts:34-50`).
  `src/features/industry/jobs.ts:29-32` uses the narrower 403-only detector precisely because
  "this login predates the scope" is a different condition from "offline" — its header comment
  (`jobs.ts:5-13`) is the design rationale, already written down.
  **Do NOT make that config the default.** `src/esi/cache.ts:57-62` documents the current
  default as a deliberate decision: `needsReauth` must never short-circuit the cache read,
  because any caller still on `loadWithCache` would regress from stale-but-present to `null`.
  Flipping it silently degrades offline behavior in every view not yet retrofitted. The correct
  shape is a **named opt-in** (`SCOPE_GATED`, see Shared primitives) that each retrofitted
  caller passes explicitly.
- **Scope state is structurally local already.** `setSyncedSetting` throws unless the key starts
  with `sync.` (`src/sync/planSync.ts:175-179`), and the sync push filter only collects
  `sync.`-prefixed, non-`sync.__` keys (`src/sync/planSync.ts:431,436`). A plain
  `db.settings.put({key: 'scopeSelection', ...})` is therefore _provably_ excluded from
  Firebase, not merely intended to be.

### Gap

1. `beginEveLogin` has no scope parameter and no UI to feed it.
2. No persistence of a per-character scope preference.
3. No presets/categories (EveLens has 3 presets + 16 categories).
4. Six of nine ESI views cannot express "you didn't grant this."

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
guard at `planSync.ts:177` makes that assertion cheap.

### Engine vs UI split

Nothing in `src/engine`. Preset→scope-set expansion (`presetScopes(preset): Scope[]`) and
category→scope grouping are pure but ESI-shaped, so they belong in `src/esi/scopes.ts`
alongside `SCOPES`, unit-tested there. `src/engine` is for EVE domain math decoupled from ESI
(ARCHITECTURE §2) — an OAuth scope taxonomy is the opposite of decoupled.

### Files touched

- `src/esi/scopes.ts` — restructure from a flat array into scope _categories_ (label key +
  scopes + which app views it unlocks), plus presets (`minimal` / `recommended` / `everything`).
  Keep `SCOPES` exported as the union of everything so existing callers and tests don't break.
- `src/app/loginFlow.ts` — `beginEveLogin(scopes?: Scope[])`, defaulting to `SCOPES`. Every
  existing `ReauthBanner` caller keeps working unchanged.
- `src/routes/Login.tsx` — add the picker (collapsed behind a "Choose permissions" disclosure;
  the primary button stays the SSO button — DESIGN §5's one-primary-per-view rule).
- `src/routes/Characters.tsx` — per-character "Permissions" affordance; this is where a
  _re-auth with different scopes_ naturally starts, and where a future "remove character"
  belongs (see 15a).
- `src/features/character/{assets,mail,calendar,contracts,orders}.ts` — switch
  `loadWithCache` → `loadWithCacheStatus` (with the opt-in `SCOPE_GATED` config) and surface
  `needsReauth`.
- `src/routes/{Assets,Mail,Calendar,Contracts,Orders}.tsx` — render `ReauthBanner` on
  `needsReauth`.
- `src/routes/Overview.tsx:16,52` — swap `loadWalletBalance` → `loadWalletBalanceWithStatus`
  (already exists, `wallet.ts:37-43`) and render `ReauthBanner` in place of the `EmptyState` at
  `:145`.
  **This is six views of work and is the bulk of 15b's cost — not a footnote.**

### New modules

- `src/features/auth/ScopePicker.tsx` — category checkbox list + preset selector; pure props in,
  `Scope[]` out. (Or `src/components/ui/` if the orchestrator decides it's a primitive; it isn't
  — it's feature-specific.)
- `src/features/auth/scopeSelection.ts` — local (non-synced) persistence of the last selection
  and reconciliation against `TokenRecord.scopes`.

### Shared primitives needed

- **A generalized "missing scope" load path.** Name it: make `jobs.ts`'s
  `{detectAuthFailure: 403-only, skipCacheOnAuthFailure: true}` config a named **opt-in** export
  from `src/esi/cache.ts` (e.g. `SCOPE_GATED`) so six callers don't each re-derive it. Opt-in,
  not default — `cache.ts:57-62` explains why changing the default would regress offline views.
  Assign ownership; this is the seam that makes graceful degradation uniform.
- **`Checkbox`** — `src/components/ui/` has no checkbox (`components/ui/index.ts` exports
  Panel, Button, StatChip, DataAgeBadge, EmptyState, Tabs, Spinner, Tooltip, ReauthBanner).
  A 16-category picker needs one. Do not build a private one.
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
  `sync.`-prefixed (assert `setSyncedSetting` would reject it — cite `planSync.ts:177`).
- `src/features/auth/ScopePicker.test.tsx` — preset selection toggles categories; deselecting
  every category disables submit; keyboard/`aria` semantics.
- `src/routes/{Assets,Mail,Calendar,Contracts,Orders,Overview}.test.tsx` — a 403 renders
  `ReauthBanner`, not `EmptyState`. (`src/features/skills/data.test.ts:101-104` and
  `src/features/industry/jobs.test.ts:97-116` are the existing templates;
  `Overview.test.tsx:122` already sets a scopes fixture.)
- Regression guard: a view _not_ using `SCOPE_GATED` still falls back to stale cache on a 403
  (locks in `cache.ts:57-62`'s decision so a future retrofit doesn't flip the default).
- E2E: `e2e/support/mockSso.ts:20-32` currently hardcodes `scp: [...SCOPES]`; parameterize it to
  echo the _requested_ `scope` query param so a spec can drive a narrow grant and assert the
  six views degrade to `ReauthBanner`. `e2e/support/fixtureData.ts:21-31` should import
  `SCOPES` (see 15a — it has already drifted).

### i18n keys

`login.choosePermissions`, `login.permissionsHint`, `scopes.preset.minimal`,
`scopes.preset.recommended`, `scopes.preset.everything`, `scopes.category.<n>` ×16 (labels),
`scopes.categoryHint.<n>` ×16 ("unlocks the Wallet view"), `scopes.required`,
`scopes.selectedCount`, `characters.permissions`, `characters.permissionsChange`,
plus `{assets,mail,calendar,contracts,orders,overview}.reauth{Title,Hint,Action}` ×6 views
(mirroring the existing `skills.reauth*` / `wallet.reauth*` keys).

### Sync / Dexie impact

**No schema bump.** Selection is a plain `db.settings` row (the `settings` table exists since
`db.version(1)`, `src/db/index.ts:93`). **No** push/pull mapping — deliberately non-`sync.`
-prefixed, which the filter at `planSync.ts:436` structurally excludes. Not a d90e417-class
change; the argument for local-only is above.

### New ESI scopes

None. 15b _narrows_ what is requested; it never adds.

### Cost

**M**, at the upper end — revise the teardown's implied split. The picker itself is small
(`startLogin` already takes an array). The cost is (a) restructuring `SCOPES` into 16
categories with labels and "what this unlocks" copy, and (b) the six-view degradation retrofit
plus its i18n and tests. If the orchestrator wants to cut scope, split (b) out as its own item
— it has standalone value even without a picker, because item 15a's purge and the 13/16/20
batch both produce exactly the "narrower grant than the app expects" state today.

### Depends on

- **15a** — should land first (independent privacy fix; also, a picker that lets a user drop a
  scope without purging its cache actively _creates_ the privacy bug).
- **Items 13, 16, 20** — should land _before_ 15b (see cross-cutting note).
- The degradation retrofit (six views) is a prerequisite for 15b being honest, whether it's
  tracked here or split out.

### Risks / open questions

- **16 categories is a lot of UI for a login screen.** Recommend: presets front and center,
  categories behind a disclosure, default = "recommended" (= today's `SCOPES`), so the common
  path is unchanged.
- **Mixed grants across characters** produce a nav where some views work for character A and
  not character B. Layout.tsx renders all 11 nav links unconditionally (`Layout.tsx:152-187`).
  Decide: gray out unavailable views per active character, or leave them and rely on
  `ReauthBanner`. Recommend the latter for v1 — cheaper and less surprising.
- **`ReauthBanner` copy is wrong for this case.** It currently says "log in again"; for a
  never-granted scope the correct message is "this view needs a permission you didn't grant."
  Consider a `variant` prop rather than 5×3 near-duplicate i18n strings.
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

**Route plumbing:** the emitter needs the route _template_. Cleanest is to pass it explicitly
into `esiFetch`/`loadWithCache` alongside the path — which pairs naturally with 15a-ii's cache
key registry, since both want the same "a new endpoint must declare its metadata" property.
Coordinate: **one registry, two consumers** (scope for the purge, route template for the log).
Flag this to the orchestrator as the single most valuable cross-item consolidation.

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
- **The route-template registry** shared with 15a-ii (one declaration, two consumers).
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

- **15a-ii's registry** (soft) — 17 needs route templates threaded to the same places 15a-ii
  threads scopes. Either build the registry once for both, or 17 ships with a
  route-template-only union and 15a-ii extends it. Recommend the former; flag the coupling.
  **This also halves 17's biggest cost:** if each registry entry carries `{ prefix, scope,
route }`, then `cache.ts` already receives the cache key and can derive the route template
  itself — outcome points 1-5 need **no** signature change at all. Only `esiFetch` needs a new
  route parameter, for points 6-7 (`client.ts:167-170`, `:180`) plus `paginated.ts` for point 8.
  That is ~25 wrappers gaining one field in a registry rather than ~25 call-site signature
  changes in two layers.
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

1. **15a must land BEFORE the 13/16/20 batch.** It is an independent privacy fix with no
   dependencies, and it makes the batch's forced re-auth safe: today, a user who re-auths and
   _declines_ one of the new consent items leaves stale cached data behind with no purge. Ship
   15a-i (blunt purge) immediately; it is a two-day change.
2. **15a's diff must be additive-safe.** Adding four scopes must be a **no-op**, not a purge.
   Only removals purge. This is the single most likely bug when the batch lands — give it a
   named test (`does not purge when scopes are only added`).
3. **15b must land AFTER the batch.** Its 16-category grouping, its labels, its
   "what this unlocks" copy and its `SCOPES`-union test all get redone when four scopes arrive.
   Building the picker first means building it twice.
4. **Land the single-source-of-truth cleanup with the batch, whoever does it.** The scope list
   exists in three places today and has _already_ drifted —
   `e2e/support/fixtureData.ts:21-31` is missing `esi-industry.read_character_jobs.v1` while
   `src/esi/scopes.ts:6-18` and `src/esi/scopes.test.ts:5-21` have it. Four more scopes across
   three hand-maintained copies will drift again. Make the e2e fixture and the test import from
   `src/esi/scopes.ts`.
5. **The batch will expose the degradation gap immediately.** `ReauthBanner` is wired in only
   3 of 9 ESI-backed views (`ActiveJobsPanel.tsx:90`, `Wallet.tsx:136`, `Skills.tsx:198`); the
   other six — Assets, Mail, Calendar, Contracts, Orders **and Overview** — discard
   `needsReauth` via `loadWithCache` (`cache.ts:98-104`; `Overview.tsx:16,52` even has a
   status-aware sibling sitting unused at `wallet.ts:37-43`). Every character on the old token
   will 403 the new endpoints and those six will render as _empty_. Whether or not 15b ships,
   adopting `jobs.ts`'s `loadWithCacheStatus` config (`jobs.ts:29-32`) as a named **opt-in**
   across the six remaining views is a prerequisite for the batch, not for the picker. Consider
   promoting it to its own item. Do not implement it by changing the shared default —
   `cache.ts:57-62` records why that would regress offline behavior.
6. **One registry, two consumers.** 15a-ii wants endpoint→scope; item 17 wants
   endpoint→route-template. Both want the property "a new endpoint cannot be added without
   declaring its metadata." Build it once. This is the highest-leverage consolidation across
   these three items and should be assigned explicitly rather than left to whoever gets there
   first.
