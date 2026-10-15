# Offline-mode fix plan (October 2026)

This plan works through the findings in
[`offline-audit-2026-10.md`](./offline-audit-2026-10.md). IDs such as R1, G2
and D3 refer to that audit.

How the work is run:

- One PR per workstream. Each workstream runs in its own git worktree, and a
  Sonnet agent implements it using `/implement`.
- I (the orchestrator) review each one with `/code-review` and drive CI to
  green, then squash-merge it.
- Waves run in order, because later waves build on what earlier ones add.
  The main example is `useOnline()` from W1.
- At most three implementers run at once (CLAUDE.md).

Every workstream follows the repo rules:

- TDD for logic modules.
- All new UI strings go through `en.json`.
- UI work follows `docs/DESIGN.md` (§6c for any new cue) and uses the
  `npm run ui:catalog` primitives.
- Scope decisions are recorded through `node scripts/new-decision.mjs`.
- Locally, run only `npm run typecheck` and the touched test files.

## Wave 1: foundations

### W1, offline core (R1, R6 store and reconnect, M5)

**Network store.** Add `src/stores/network.ts`:

- `isOnline()`, `useOnline()` and `onReconnect(cb)`, backed by a single
  `online`/`offline` listener.
- `useSyncStatus.ts` and `useFirstRunReady.ts` use it instead of their own
  listeners.

**R1: offline is not an auth failure.**

- An `AuthError` with status 0 (`network_error` or `timeout`) is a network
  failure, not an auth failure.
- This applies to `isAuthFailure` / the cache's default detector,
  `reportWriteAuthFailure`, and the `skipCacheOnAuthFailure` paths in
  `industry/jobs.ts` and `pi/data.ts`.
- `cache.test.ts` gets a case for each.

**Network failures classified.** A fetch or token-refresh network failure
(a fetch `TypeError`, or an `AuthError` with status 0) is classified as an
offline failure. There is deliberately no gate on `navigator.onLine` before the
request: browsers can report `false` while endpoints are reachable, so the
signal stays advisory (UI status, skipping polls, the reconnect trigger).

- `cache.ts` treats it as a network failure and serves the cache.
- It never writes `authFailure` to the activity log or burns the error
  budget.

**Reconnect recovery.** When `onReconnect` fires:

- clear `revalidationFailures` and call `emitCacheRevalidated()`;
- `triggerSync` the active character;
- re-run the lazy SDE warm;
- give the foreground poller a catch-up run.

**Polling and sync status.**

- The foreground notification poller and the communities request-badge poll
  skip their tick while offline.
- A sync failure recorded while offline shows as `offline`, not `error`.

### W2, offline assets (R4, R5)

**Precache.**

- Precache `blueprints.json` and `shipTree.json`.
- Precache these `market/*` files: `systems.json`, `jumps.json`,
  `systemPositions.json`, `groups.json`, `attributes.json`, `regions.json`,
  `globalMarkets.json`, `lpCorporations.json`.
- Add `webp` to `globPatterns`.

**Warm.**

- Add `market/systemPositions.json` to `LAZY_SDE_FILES`, and drop the files
  that are now precached.
- Add a test that keeps `LAZY_SDE_FILES` in step with the `vite.config.ts`
  globIgnores.
- One file's failure no longer stops the rest of the warm.
- Raise the `sde-data` `maxEntries` so lazy files plus superseded versions
  can't evict each other.

**R5: chunk-load recovery.**

- When offline, or when recovery would decline, `vite:preloadError` doesn't
  call `preventDefault()` and doesn't purge. The import rejects into the
  ErrorBoundary.
- When online, the purge deletes only `workbox-precache-*`, not the
  SDE/dogma/image caches.
- ErrorBoundary copy is offline-aware, and it retries on reconnect.

**Scope decision.** Amend the "feature SDE files load on demand" decision
with a new decision file.

### W3, fetch timeouts (R3)

- Add `AbortSignal.timeout` (about 15 s) to:
  - Fuzzwork `fetchBatch`;
  - the same-origin SDE `fetchJson` (`loadMarketSde` / `loadSde`);
  - zKillboard, EVE Workbench and EVE-Scout.
- The dogma engine download gets stall detection.
- A timed-out Fuzzwork call must clear `hubPricesInFlight`.
- zKill import reports offline or unreachable as its own failure, not "not
  found".

## Wave 2

### W4, price placeholders (R2, I3, and the price parts of W7)

**Owner decision.** Market pricing being unavailable offline is acceptable.
There is no stale-price fallback, no change to the `prices.ts` cache or TTL
semantics, and no scope decision. The goals are only that no page errors or
spins forever when prices can't be fetched, and that misleading copy ("no
orders", "0 ISK", "move to a busier hub", "Healthy", "Try again shortly") is
replaced by a neutral "Prices unavailable offline" placeholder. This is
delivered by a small status signal (`getHubPricesWithStatus` and
`getStationPricesWithStatus` return `{ prices, unreachable }`;
`MarketSnapshot.pricesUnreachable` carries it to Build Plan, PI and the LP
Store) and by consumers that read it: Build Plan detail, PI Plan and Map,
Appraisal and Compare Hubs, Open Orders, contract market value, Mining Tax,
LP Store, and the Skills injector and skills-to-buy panels.

### W5, data integrity (D1, D2, D5)

- **Remove character and Log out (all).** When offline, or when that
  character's sync queue isn't empty, warn first and offer Cancel. The
  confirm copy is accurate.
- **Net-worth snapshot.** Skip the daily snapshot when any source came from
  cache or every hub price is unavailable, so a later online run records the
  real value.
- **Clear cached ESI data.** Ask for confirmation first, and warn when
  offline.

### W6, local static data (G2, G3, G7, G8, G9, G16, G17)

- Show Info, row skills, Compare Attributes and hauling go through the cached
  `loadUniverseTypeOnce`.
- Fitting required skills report "unknown" rather than `[]` on a miss, in
  the missing-skills chip, skill gaps and Fit Goal.
- Build system lookup, then `systemSecurity`, read `market/systems.json` /
  `sde/solarSystems.ts` first and fall back to ESI.
- `stores/publicInfo.ts` reads through the esiCache-backed public-info
  loaders.
- Region and constellation names go through cached loaders.
- Skill books fall back to the SDE `basePrice` when no hub price is
  available.

## Wave 3

### W7, price consumers (D3, D4, market copy)

The price items of this workstream (Open Orders, Appraisal and Compare Hubs,
contract market value, LP Store, Mining Tax and its Assign warning, and the
skills injector and skills-to-buy panels) moved into W4's revised scope as
"Prices unavailable offline" placeholders. Nothing price-related is left
here.

### W8, failed states: Industry, market, LP, mining

Replace the endless spinners caused by uncaught rejections with failed or
offline states plus Retry:

- **Industry**: load the catalog separately, so owned blueprints still
  render.
- **LP Store**: also fixes a corporation with no offers never becoming
  ready.
- **Stock Builder** and its Add-item search.
- **Market-wide trees.**
- **`LogProductionFromJobDialog`.**
- **`usePageItemActions`.**
- **Appraisal's `loadReprocessing`**: degrade to no refine column.
- **Ore decision dialog.**
- **Mining yield with refining.**
- **Corp roles stuck on `unknown`.**

### W9, failed states: Fittings, skills

- **Fitting catalogue**: failed state with Retry.
- **Dogma engine**:
  - publish its load state;
  - offline copy instead of "still downloading" forever;
  - offline-aware Compare and stats copy.
- **Ship Tree**: Retry button.
- **Masteries**: three states — loaded, none, not available offline.
- **`FittingLoadCard`** and **`usePlanEditorData`**: add catches;
  `usePlanEditorData` stops making the local catalog wait on ESI.
- **Move plan**: "hauler sizing data unavailable" instead of blaming the
  pilot's skills.
- **Fitting stats**: a "skills unknown" note.
- **Share link offline**: copies the permanent `/share/fitting?f=` URL.
- **Save to EVE**: offline guard.

## Wave 4

### W10, honest empty states (data views)

Each of these says "couldn't load (offline)" instead of claiming there is
nothing:

- **Corp board**: readability tracked per kind.
- **CorpMembers.**
- **Contract detail**: uses the detailed load outcome.
- **Standings**: shows status and the cached label.
- **BPC Sourcing / Contract Search.**
- **Opportunities**, and the market-wide scan (disabled while offline).
- **Order book**: offline copy.
- **Ships tab**: notice for skipped characters.
- **Route Safety**: notice that jump-drive legs are unavailable.
- **Solar-system picker**: error state.

### W11, honest write actions and links

- **Offline-aware copy, with buttons disabled or annotated while offline**,
  for these ESI writes:
  - waypoints and set destination;
  - Open in EVE;
  - mail send (say the draft is saved);
  - RSVP.
- **Mail**: "Load more" and forward search say they need a connection;
  unopened bodies say "not downloaded yet".
- **Callback**: shows Retry on a network failure instead of auto-redirecting
  to SSO.
- **Shared appraisal link**: strips the parameter only after a successful
  load.
- **PublicInfoModal and SharedLink**: get Retry buttons.

### W12, shared offline UI (R6 UI)

- **Shell `OfflineBanner`** at every width, with a DESIGN.md §6c cue.
- **"Needs a connection" guard** on SSO and re-auth buttons (`loginFlow`).
- **Cached data plus a small re-auth note, instead of the banner replacing
  the data**, in:
  - Skills, Clones, Assets, Mail, Contacts;
  - Overview widget state.

## Wave 5

### W13, `CachedNotice` primitive

- **New primitive**: `components/ui/CachedNotice`, with a story. It renders
  "Showing cached data · <age>" at every width.
- **Migrate** the hand-written copies to it, including the duplicate
  `skills.offlineTitle`.
- **Add it to the views that never show the cached state**:
  - Corp, CorpAssets, CorpMembers;
  - PI route, EventDetailModal, Price History;
  - Wallet multi-character totals;
  - Ships, Skill Plans, Certificates;
  - Overview header.

### W14, offline data panel and prefetch

**Settings → Offline data panel:**

- the cached status of each data pack;
- a storage estimate;
- `navigator.storage.persist()`, also requested once after the first
  character is added;
- a "Download everything for offline" button that ignores the cellular gate.

**Prefetch:**

- bounded prefetch of the newest mail bodies;
- prefetch of upcoming calendar event details.

**Stop serving cached data as current:**

- **Share link payloads**: cached until they expire.
- **Mail mark-read**: patches the cached header, so the read state survives
  a reload.
- **Overview Location widget and Pilot Lookup**: show the data's real age,
  not "just now".

### W15, remaining gaps (G11, G12, G19, L1)

- **Communities**: cache the last list and library snapshot, read-only and
  labelled, with writes disabled offline.
- **PI**: "link load unknown" when the radius data is missing.
- **Order books and EVE-Scout**: serve the expired in-session copy with an
  age label.
- **Global paste router**: loads catalogues per destination and shows a toast
  on failure.

## Deferred (need build-sde output changes; file as tickets)

- Precached `requiredSkills.json` (the M variant of G3).
- Precached `implants.json` (G15).
- Persisted PI radius for the pilot's own colonies (the M variant of G12).
- Build Location offline picks (G20).
