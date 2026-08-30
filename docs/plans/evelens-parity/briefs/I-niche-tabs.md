# Item 20 — Remaining niche character tabs

Scope verified against `https://esi.evetech.net/meta/openapi.json?compatibility_date=2025-08-26`
(full spec downloaded and grepped locally, 2026-08-29). App itself pins
`COMPATIBILITY_DATE = '2026-08-01'` (`src/esi/client.ts:11`) — six weeks newer than
the spec snapshot I fetched; nothing in the diffed paths below is compatibility-date-
gated (no deprecation notices on any of the nine paths), so this gap doesn't change
any finding, but the orchestrator should re-pull the spec at the app's actual pinned
date before cutting tickets.

**Artifact claim:** "Breadth, not depth. Each is a scope and a table. Add on demand,
not as a checklist — every one costs a re-auth prompt."

**Verdict:** PARTIALLY TRUE — three concrete refutations, not a wholesale rebuttal.

1. `employment history` (`/characters/{id}/corporationhistory`) has `"security": []`
   in the spec — it's a **public** endpoint. Zero scope, zero re-auth cost. Not "a
   scope and a table" — no scope at all.
2. `notifications`' `text` field is not display-ready. Verified via web search:
   community/EVEMon sources (GitHub `evemondevteam/evemon` `NotificationRefTypes.xml`;
   ESI issue tracker `esi/esi-issues#1408` re: notification text formatting) confirm
   ESI returns **raw YAML key:value params** per notification (e.g.
   `"amount: 3731016.4\nitemID: 1024881021663\npayout: 1\n"`), keyed by a `type` enum
   with 150+ values in the spec's own enum list. Turning that into a sentence needs a
   per-`type` template table this app doesn't have and ESI/SDE don't provide. That's
   depth, not "a table."
3. "Every one costs a re-auth prompt" overstates the marginal cost. `SCOPES_STRING`
   (`src/esi/scopes.ts:23`) is one space-joined authorize-URL parameter — all new
   scopes for this batch plus items 13/16 collapse into **one** re-auth prompt, per
   ARCHITECTURE.md §4 and this orchestrator's own batching plan. The real cost isn't
   "one prompt per tab", it's that **every scope on the list — shipped or not — grows
   that one prompt** (`SCOPES` goes 11 → up to 19 entries) and is a trust cost for
   users who never see the tab. Conclusion: batch scopes for tabs you're actually
   shipping in this round; don't pre-request the full nine "for later."

**Verified baseline:** No niche tabs exist. `src/features/character/` currently has
exactly the 6 files ARCHITECTURE.md §2 lists (`assets.ts`, `calendar.ts`,
`contracts.ts`, `mail.ts`, `orders.ts`, `wallet.ts`, plus `names.ts`/`typeNames.ts`/
`stations.ts`/`format.ts`) — confirmed via `ls`. `src/esi/scopes.ts:6-18` has 11
scopes, none of the nine below among them. `src/esi/endpoints.ts` (630 lines) has no
wrapper for any of the nine paths — confirmed by full read. `docs/DESIGN.md` §4:
`DataTable` is listed `○` (planned, not built) — confirmed, `grep -rn "DataTable"
src` returns nothing.

Read end-to-end for cost baseline: `src/features/character/wallet.ts` (59 lines) +
`src/routes/Wallet.tsx` (287 lines) + `src/features/character/wallet.test.ts` (174
lines); `src/features/character/contracts.ts` (11 lines) + `src/routes/Contracts.tsx`
(150 lines) + `contracts.test.ts` (66 lines). Both routes hand-roll the identical
~50-line `Snapshot`/`requestKey`/`cancelled`-guard/`loading`/`fromCache` lifecycle
(`Wallet.tsx:25-73`, `Contracts.tsx:12-60`) and identical raw `<table>` markup
(`Wallet.tsx:172-186`, `Contracts.tsx:107-119`: `<table className="w-full text-xs">`,
`thead` row `border-b border-line text-left text-text-dim`, `th` `px-3 py-2
font-semibold uppercase`, `tbody className="divide-y divide-line"`, cells `px-3
py-1.5`, numerics `text-right tabular-nums`). Neither route paginates in the UI —
both fetch every ESI page and render the full set client-side.

### Per-tab table

| Tab                | ESI endpoint(s)                                                                                | Scope                                                          | Auth?  | Paginated?                                | Name/ID resolution?                                                                                                                                                                                                                                        | SDE?                       | Pure-math?                                                                                                                                                                                  | Effort                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Notifications      | `GET /characters/{id}/notifications`                                                           | `esi-characters.read_notifications.v1`                         | Yes    | No (no `page` param, no `X-Pages` header) | Yes — `sender_id`+`sender_type` (character/corp/alliance/faction/other) via `resolveNames`                                                                                                                                                                 | No                         | **Yes, heavy** — `text` is raw YAML params; needs a per-`type` template table (150+ types) not present in ESI or SDE                                                                        | **L** (not M)                                     |
| Kill log           | `GET /characters/{id}/killmails/recent` (list) + `GET /killmails/{id}/{hash}` (detail, public) | `esi-killmails.read_killmails.v1`                              | Yes    | Yes — `X-Pages` on the list               | Yes — attacker/victim `character_id`/`corporation_id`/`alliance_id`/`faction_id` via `resolveNames`; `ship_type_id` via `typeNames.ts`; `solar_system_id` via `resolveNames` (`solar_system` category)                                                     | No (see below)             | No (v1: no ISK valuation)                                                                                                                                                                   | **L**                                             |
| Standings          | `GET /characters/{id}/standings`                                                               | `esi-characters.read_standings.v1`                             | Yes    | No                                        | Yes, but **mixed types**: `from_type` is `agent`\|`npc_corp`\|`faction`. `postUniverseNames`'s category enum (`alliance\|character\|constellation\|corporation\|inventory_type\|region\|solar_system\|station\|faction`) has no `agent` bucket — see Risks | No                         | No                                                                                                                                                                                          | **M** (bumped for name-resolution risk)           |
| Contacts           | `GET /characters/{id}/contacts` + `GET /characters/{id}/contacts/labels`                       | `esi-characters.read_contacts.v1` (both endpoints, same scope) | Yes    | Yes — `X-Pages` on `/contacts`            | Yes — `contact_type` character/corporation/alliance/faction, all covered by `resolveNames`                                                                                                                                                                 | No                         | No                                                                                                                                                                                          | **S/M** — near-identical shape to `Contracts.tsx` |
| Employment history | `GET /characters/{id}/corporationhistory`                                                      | **none — public**                                              | **No** | No                                        | Yes — `corporation_id` via `resolveNames`                                                                                                                                                                                                                  | No                         | No (duration via existing `src/lib/duration.ts` formatting)                                                                                                                                 | **S** — cheapest of the nine                      |
| Medals             | `GET /characters/{id}/medals`                                                                  | `esi-characters.read_medals.v1`                                | Yes    | No                                        | Yes — `issuer_id` (character), `corporation_id`                                                                                                                                                                                                            | No                         | No (medal `graphics` rendering out of scope for v1 — show title/description/date/issuer only)                                                                                               | **S/M**                                           |
| Loyalty points     | `GET /characters/{id}/loyalty/points`                                                          | `esi-characters.read_loyalty.v1`                               | Yes    | No                                        | Yes — `corporation_id`, mostly NPC corps, via `resolveNames`                                                                                                                                                                                               | No                         | No                                                                                                                                                                                          | **S** — simplest response shape of the nine       |
| Factional warfare  | `GET /characters/{id}/fw/stats`                                                                | `esi-characters.read_fw_stats.v1`                              | Yes    | No                                        | Small — `faction_id` only if enlisted, via `resolveNames`                                                                                                                                                                                                  | No                         | No confirmed math; rank-number→rank-name mapping is NOT in this ESI response and NOT verified here — flag as open question, don't hardcode from memory                                      | **S**                                             |
| Research points    | `GET /characters/{id}/agents_research`                                                         | `esi-characters.read_agents_research.v1`                       | Yes    | No                                        | `agent_id` has the **same no-category problem as Standings**; `skill_type_id` **is** covered by SDE (skills are in `build-sde.mjs`'s "referenced" set, confirmed below)                                                                                    | **Yes** (skill names only) | **Unverified** — spec gives `points_per_day`, `remainder_points`, `started_at` but no documented formula for current accumulated total or a cap; do not derive one without further research | **S/M**                                           |

SDE note (kill log vs. research points): checked `scripts/build-sde.mjs:298-318` —
`types.json` only includes typeIDs "referenced" by skills or blueprint
materials/products/skills (`referenced` set built at lines 300-309). Ship hulls that
are blueprint products may be present, but a killmail's fitted modules/ammo/drones
are ordinary market items with no guarantee of blueprint-product membership — so kill
log must resolve names via `features/character/typeNames.ts` (live ESI + cache), the
same pattern `Wallet.tsx` already uses for transaction `type_id`, not the SDE. Skill
`skill_type_id` on the other hand is always in `types.json` (skills are explicitly
walked into `referenced`), so research points gets SDE names for free.

**Gap:** Everything above — no endpoint wrapper, no scope, no data module, no route,
no i18n, no tests exist for any of the nine.

**Engine vs UI split:**

- `src/engine`: **nothing today**, matching Wallet/Contracts (zero engine
  involvement for either). The one candidate is a notifications YAML-param parser +
  type→template lookup — that logic is pure (parse string, fill template, no
  fetch/DOM/Dexie) and would be TDD-required if built, but per the recommendation
  below, don't build notifications, so don't create this module yet.
- `src/features/character/*.ts`: one thin `loadWithCache`/`loadWithCacheStatus`
  wrapper per shipped tab, exactly the `wallet.ts`/`contracts.ts` shape (10-40 lines
  each).
- `src/routes/*.tsx`: one route per shipped tab, composing `Panel`/`DataAgeBadge`/
  `EmptyState`/`Spinner`, ideally via the shared hook + `DataTable` recommended below
  instead of another hand-rolled `<table>`.

**Files touched:**

- `src/esi/endpoints.ts` — add one wrapper per shipped tab (follows existing shape,
  e.g. `getCharacterContacts`/`getCharacterContactLabels` paginated via
  `fetchAllPages`, matching `getCharacterContracts`).
- `src/esi/scopes.ts` — append only the scopes for tabs actually shipped this round
  (see batched list below) — not all nine.
- `src/app/App.tsx` — route registration per shipped tab.
- `src/components/Layout.tsx` (nav) — nav entry per shipped tab.
- `src/i18n/locales/en.json` — keys per shipped tab (see below).
- `e2e/support/mockEsi.ts` — intercept per shipped tab's endpoint(s), or e2e will
  fail the network guard the moment a route under test calls it.

**New modules (per shipped tab):**

- `src/features/character/<tab>.ts` — read-through cache wrapper, mirrors
  `contracts.ts`.
- `src/routes/<Tab>.tsx` — route component.
- Colocated `src/features/character/<tab>.test.ts` and `src/routes/<Tab>.test.tsx`.

**Shared primitives needed (build BEFORE the first shipped tab, not per-tab):**

1. **`DataTable`** (DESIGN.md §4, currently `○`). Interface derived directly from
   what `Wallet.tsx`/`Contracts.tsx` already do by hand, not invented:
   - `columns: { key; header; align?: 'left' | 'right'; format?: (row) => ReactNode; sortable?: boolean }[]`
   - `rows: T[]`, `getRowKey: (row) => string | number`
   - `initialSort?: { key; direction }` — DESIGN.md §4 already says "dense
     **sortable**", and both existing routes already sort in-route with `useMemo` +
     `localeCompare`, so sorting belongs in the component, not left to callers.
   - `emptyState`: reuse `EmptyState`, don't reinvent.
   - A slot/prop for the `fromCache` warning banner both routes currently hand-roll
     (`Wallet.tsx:169-170`, `Contracts.tsx:102-105` — identical `text-[11px]
text-warning uppercase` paragraph).
   - **Explicitly no built-in pagination** — neither existing route paginates in the
     UI (both fetch every ESI page and render the full set); adding UI pagination to
     v1's interface would be speculative, not observed need. Add it later if a tab's
     row count actually demands it.
2. **A shared route-lifecycle hook** (not a component) — e.g.
   `useEsiViewSnapshot(characterId, loaders)` — factoring out the `Snapshot`/
   `requestKey`/`cancelled`-guard/`loading`/`refreshKey`/reauth boilerplate
   (`Wallet.tsx:25-104`, `Contracts.tsx:12-80`, ~50 nearly-identical lines each).
   This is genuine, observed repetition (two real instances, identical shape) —
   worth factoring now, before a third and fourth copy land.
3. Do **NOT** build a generic "ESI list view" full-page component. Wallet is three
   tabs plus a scalar balance plus two tables; Contracts is one table. A component
   trying to cover both shapes would either grow escape hatches until it's not
   simpler than the route, or force Contracts-shaped tabs (most of these nine) into
   a Wallet-shaped abstraction they don't need. The honest split is: `DataTable` for
   markup, the lifecycle hook for data-fetching boilerplate, and the route itself
   stays a real component that composes them — that's deep enough without being
   generic to the point of hurting readability.

**Design tokens/components used:** `Panel`, `DataAgeBadge` (required, every tab is
API-derived), `EmptyState`, `Spinner`, `ReauthBanner` (any tab whose auth can fail
independently — all except employment history), `Tabs` only if a tab groups sub-views
(none of the nine obviously need it). Table styling per the `Wallet`/`Contracts`
conventions cited above, ideally through the new `DataTable` rather than another
hand-rolled `<table>`.

**Tests:** Per shipped tab, mirror `wallet.test.ts`/`contracts.test.ts`: MSW-mocked
fetch-and-cache test, offline-fallback test, and (where the endpoint is scoped)
a `needsReauth` test. `e2e/support/mockEsi.ts` additions only for tabs that get e2e
coverage — not required for all nine day one. No TDD-required modules unless the
notifications template parser is built (it isn't, per recommendation).

**i18n keys:** New top-level namespace per shipped tab (`contacts.*`, `standings.*`,
`employmentHistory.*`, `loyaltyPoints.*`), following the existing `wallet.*`/
`contracts.*` key shape: `title`, `refresh`, column headers, `emptyTitle`/
`emptyHint`, and `reauthTitle`/`reauthHint`/`reauthAction` for any scoped tab (see
`en.json:287-289` for the wallet precedent). List exact keys once the orchestrator
picks which tabs ship.

**Sync / Dexie impact:** None for any of the nine. All nine are pure API-Derived
Data (CONTEXT.md glossary) cached in the existing generic `esiCache` table
(`src/db/index.ts` `EsiCacheRecord`) — no new Dexie table, no schema version bump, no
`sync.`-prefixed setting, no `src/sync/` push/pull mapping. None of these are
Editable Data.

**New ESI scopes — exact batched block:**

```
esi-characters.read_notifications.v1
esi-killmails.read_killmails.v1
esi-characters.read_standings.v1
esi-characters.read_contacts.v1
esi-characters.read_medals.v1
esi-characters.read_loyalty.v1
esi-characters.read_fw_stats.v1
esi-characters.read_agents_research.v1
```

(`employment history` needs none — `corporationhistory` is public.)

**Only include the scopes for tabs actually shipped in this batch** — see Verdict
point 3. If the orchestrator ships the Tier-1 recommendation below (contacts,
loyalty points), the real addition to the consent screen is just:

```
esi-characters.read_contacts.v1
esi-characters.read_loyalty.v1
```

merged into the same authorize-URL batch as items 13/16.

**Cost:** Teardown said M each, flat. Revise: not flat. **S**: employment history,
loyalty points. **S/M**: contacts, medals, factional warfare, research points.
**M**: standings (name-resolution risk). **L**: notifications, kill log — both have
a real hidden second problem (template-table ownership; N+1 fetch pattern),
not just "a scope and a table."

**Depends on:** Nothing structurally blocking — no dependency on items 13/16 beyond
sharing one re-auth batch window (do it now while a re-auth prompt is already
planned, not because of a technical dependency). `DataTable` and the lifecycle hook
should land before the first shipped tab, not as a prerequisite item number — they're
small enough to build alongside tab #1 and reuse for tab #2 onward.

**Risks / open questions:**

- **Standings/research-points name resolution**: `from_type: agent` / `agent_id` has
  no matching category in `postUniverseNames`. Per ARCHITECTURE.md §4, `POST
/universe/names` rejects the **whole batch** with 404 if even one id is
  unresolvable — `typeNames.ts` exists specifically to work around this for type
  IDs. An unresolvable agent id in a mixed standings/research-points batch would
  blank name resolution for the corp/faction rows in the same call too, not just the
  agent row. Needs either per-type-bucketed calls or a `typeNames.ts`-style per-id
  fallback before shipping either tab — concrete effort add, not a footnote.
- **Notifications template ownership**: the type→template table (EVEMon's
  `NotificationRefTypes.xml` is the reference implementation) lives in neither ESI
  nor the SDE. Building it means vendoring and then owning a third-party mapping
  forever as CCP adds notification types — a maintenance liability, not a one-time
  cost. Also unresolved: import/licensing terms of any existing template set.
- **Kill log fetch cost**: `killmails/recent` returns only `{killmail_id,
killmail_hash}` pairs; every kill needs a second public call to
  `/killmails/{id}/{hash}` for details. A character with hundreds of kills means
  hundreds of sequential (or concurrency-capped) public fetches — same shape as
  `typeNames.ts`'s per-id fallback but with no batch endpoint at all to fall back
  from. zKillboard already serves this need well for EVE players; consider
  link-out instead of rebuilding.
- **Research points formula**: do not build any accumulation/cap engine module until
  the actual current-total formula is verified against a live response or authoritative
  docs — the ESI schema alone (`points_per_day`, `remainder_points`, `started_at`)
  doesn't specify it.
- **FW rank names**: `fw/stats` returns `current_rank`/`highest_rank` as bare
  integers with no name mapping in this response. Don't hardcode a rank-name table
  from memory — verify separately if this tab is built.

## Ranked recommendation

The teardown's own advice ("add on demand, not as a checklist") is right, and the
per-tab data above supports building **at most three of the nine now**, not nine.

**Build now (Tier 1):**

1. **Employment history** — zero scope cost, zero re-auth cost (public endpoint),
   cheapest build in the set, and a natural fit next to the existing `Characters`/
   `Overview` pages. No reason not to ship this first.
2. **Contacts** — reuses `resolveNames` exactly like `Contracts.tsx` already does;
   real day-to-day utility (checking standings/watch-list before engaging); pairs
   naturally with the existing Contracts route the task itself points at.
3. **Loyalty points** — simplest response shape of the nine, and LP is a real input
   to the existing Industry feature (LP-store items, corp LP grinding value) — the
   one tab here with an actual tie to a feature already shipped, not just thematic
   adjacency.

**Defer, revisit only if a user asks (Tier 2):** 4. **Standings** — real utility but the agent-name-resolution risk above needs
solving first; bundle with Contacts' scope batch if built, since the UI and
name-resolution code would be near-identical. 5. **Medals** — vanity/cosmetic; low daily-use, no downstream feature depends on it. 6. **Factional warfare stats** — only relevant to the minority of characters
enrolled in FW; small user base for the scope cost.

**Defer indefinitely — do not build without a strong new reason:** 7. **Research points** — narrow niche (agents-research-focused industrialists), and
the accumulation formula isn't even verified yet. A spreadsheet or the in-game UI
already covers this fine. 8. **Notifications** — the heaviest hidden cost in the set (perpetual third-party
template maintenance) for a feed most players triage in-game anyway, not in a
companion app. 9. **Kill log** — highest surface-level user desire of the nine, but the worst
cost/benefit: N+1 fetch pattern, no aggregate stats without building them, and
zKillboard already does this better. Link out to zKillboard/character page
instead of rebuilding a worse version in-app.

**Bottom line:** most of the nine should not be built. Ship employment history,
contacts, and loyalty points as one batch (2 new scopes, not 8); leave the rest on
the backlog until a specific user request justifies the individual cost profile
above.
