# Offline-mode audit (October 2026)

How this was made: six read-only reviewers each covered one area of the app:

1. Shell and infrastructure
2. Skills, Clones and Fittings
3. Industry and Planetary Industry
4. Market, Wallet, Contracts and LP Store
5. Overview, Characters, Settings, Communities, Contacts and Sharing
6. Assets, Mail, Calendar, Corporation, Mining Tax and Travel

Every page, tab, modal, drawer, row menu and action in each area was traced
down to its fetch. The findings marked **(verified)** were re-checked against
the code by hand.

"Offline" here covers three situations:

- `navigator.onLine === false`, where every fetch fails at once.
- Lie-fi, where a fetch hangs instead of failing.
- A cold start of the installed app with no network, an empty memory cache
  and an expired access token. EVE tokens last about 20 minutes, so almost
  every offline cold start is this case.

Some features genuinely need the internet: live order books, public contracts
and Contract Search, zKillboard, EVE Workbench, EVE-Scout, SSO login, ESI
writes, and Firebase live state. For those, the audit only checks that they
fail gracefully.

---

## 1. Root causes (fixing these clears most of the findings)

### R1: going offline with an expired token is treated as "log in again" (verified, High)

**The chain.** The token refresh fails with a network error and throws
`AuthError('network_error' | 'timeout', status 0)` (`src/auth/sso.ts:73-79`).
`isAuthFailure` (`src/esi/client.ts:121-124`) returns `true` for _any_
`AuthError`. So `loadWithCacheStatus` (`src/esi/cache.ts:849-859`, and `:1180`
for paginated loads) sets `needsReauth: true` and emits the shell-wide auth
failure. `tokenProvider.isTotalAuthFailure` already narrows this correctly to
`invalid_grant`, so nobody is signed out. The cache layer does not use that
narrower check.

**What the user sees.**

- The "EVE access was refused — log in again" notice on every page. It comes
  back after dismissal.
- These views check `needsReauth` before their data, so a Grant or re-auth
  banner replaces the cached data:
  - Skills, Clones, Assets → Items, Mail, Contacts
  - the Overview widgets: wallet, training, calendar, mail, orders, contracts,
    mining and others
  - the Wallet EverMarks figure
- Industry jobs and PI planets use `skipCacheOnAuthFailure`, so they get
  `cached: null` and the cached data is gone entirely (`industry/jobs.ts:54`,
  `pi/data.ts:50`).
- ESI writes (Save to EVE, waypoints) report "refused".
- The net-worth snapshot is skipped.
- The activity log fills with `authFailure` entries.

**Fix (S).** Treat an `AuthError` with status 0 as a network failure:

- in `isAuthFailure`, or in the cache's default detector;
- in `writeAuthFailure.reportWriteAuthFailure`;
- in the `skipCacheOnAuthFailure` paths.

Add a `cache.test.ts` case for an `AuthError` coded as a network error; only
`invalid_grant` is tested today. As a backstop, views should render cached
data with a small re-auth note rather than _replacing_ it with a banner.

### R2: market prices have no stale fallback (verified, High)

**The cause.** Hub prices are saved in Dexie for 7 days but served only
inside a 15-minute TTL (`src/market/prices.ts:5-12`, `:181`). A failed fetch
becomes `NULL_AGGREGATE`, which looks exactly like "no orders".

- Adjusted prices fall back only with `allowStale`, and Industry doesn't pass
  it (`industry/marketData.ts:160-171`).
- The system cost index uses the same 15-minute rule (`marketData.ts:136-148`).

**What the user sees after about 15 minutes offline.**

- **Build plans:** "Price data unavailable", and every material "has no
  price on the chosen side of the market".
- **PI Plan and Map:** "prices unavailable".
- **Appraisal:** 0 ISK, and the message blames the market.
- **Contract value:** "0 ISK (+N unpriced)".
- **LP Store:** ISK/LP shows "—" with no explanation.
- **Open Orders:** shows "Healthy", and writes that false reading into
  undercut history (see M-2).
- **Mining Tax:** "Jita has no buy orders" advice, and Assign is allowed at
  0 ISK.
- **Skills:** "No sell orders at Jita" for injectors and skill books.
- **Fittings:** the price section is unpriced.
- **Clones:** implant values are blank.

**Fix (M).**

- When a fetch fails, serve the persisted row up to the 7-day prune, with
  `fetchedAt` and `stale: true`.
- Use `allowStale` for adjusted prices, and the stale row for the cost
  index.
- Return the types that _failed_ separately from those with _no orders_, so
  the copy can say "Prices as of 14:02 (offline)".
- `useMarketSnapshot` should stamp the data's age, not the time it was read
  (it currently shows "just now").

This reverses a deliberate rule: the comments at `prices.ts:8-10` and
`marketData.ts:12-14` cite GLOSSARY "Data Age". It needs a scope decision
(`node scripts/new-decision.mjs`).

### R3: fetches with no timeout leave spinners up forever on lie-fi (High)

These fetches have no timeout:

- Fuzzwork, `src/market/fuzzwork.ts:79`
- Same-origin SDE loads, `src/sde/loadMarketSde.ts:23-27`
- The dogma engine download, `dogmaFittingEngine.ts:106-114`
- zKillboard, `lib/zkillboard.ts:21`
- EVE Workbench, `lib/eveWorkbench.ts:17`
- EVE-Scout, `lib/eveScout.ts:93`
- Firestore-lite reads (unverified)

`prices.ts` shares one in-flight request per key (`hubPricesInFlight`), so a
single hung Fuzzwork call freezes every later asker for those types, even
after the connection comes back.

Pages blocked by this: Open Orders, Appraisal, LP Store, the build plan's
"Fetching prices…", the PI Map tab, Route Safety, Thera, "Downloading ship
data…", and Load from link.

**Fix (S).** Add `AbortSignal.timeout(~15s)` to each, as
`contractSearch/r2OfferSnapshot.ts:68` already does.

### R4: the static data a feature needs is often missing on the device (verified, High/Medium)

`vite.config.ts` globIgnores keep these files out of the precache:

- `blueprints.json`, `shipTree.json`, `masteries.json`, `reprocessing.json`
- the `pi-*` files
- everything under `data/market/**`
- the dogma engine (about 10 MB)

They are cached only after first use, or by the background warm
(`warmLazySde.ts`). That warm has several gaps:

- It runs once per page load, 90 s after boot, in an idle slot.
- It stops at the first failure.
- It skips the dogma engine on cellular, and skips everything on
  Save-Data or 2g/3g.
- It never retries on `online`.
- It never fetches `market/systemPositions.json`, which is missing from
  `LAZY_SDE_FILES` (verified).
- The `sde-data` cache holds at most 32 entries. 18 lazy files plus
  superseded `?v=` versions can evict a needed file.

On a device that never opened a feature online, that feature breaks offline.
See section 2.

Recommended split:

| Precache (small, or backs core local features)                                                       | Raw size | Keep lazy, but warm reliably                                     |
| ---------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `blueprints.json`: Industry, LP Store, Stock Builder, Build Plan menu                                | 1.6 MB   | `masteries.json` (2.9 MB; consider slimming, then precache)      |
| `shipTree.json`                                                                                      | 0.59 MB  | `reprocessing.json` (1.46 MB)                                    |
| `market/systems.json`, `jumps.json`: offline route planning, system pickers                          | 0.85 MB  | `pi-planet-radius.json`, `pi-system-planets.json`                |
| `market/systemPositions.json`: jump drive                                                            | 0.23 MB  | `market/types.json`, `stations.json`, `variations.json`          |
| `market/groups.json`, `attributes.json`, `regions.json`, `globalMarkets.json`, `lpCorporations.json` | ≈0.27 MB | dogma engine (≈10 MB)                                            |
|                                                                                                      |          | `marketWideTrees.json`, `typeNames.json` (online-only consumers) |

Also:

- Add `webp` to `globPatterns`. The Survey how-to, Rig match helper and
  landing images break offline today (verified: `public/images/**/*.webp`,
  `public/landing/*.webp`).
- Add a test that diffs `LAZY_SDE_FILES` against `public/data` minus what
  the precache keeps.
- Make the warm run again on `online` and `visibilitychange`.

These changes amend decisions `20260928-144005` and `20260930-164429`.

### R5: a chunk-load failure offline wipes every cache and unregisters the service worker (verified, High)

**The chain.** The `vite:preloadError` handler (`src/main.tsx:29-36`) always
calls `preventDefault()` and then `recoverFromStaleBuild()`. That unregisters
every service worker and deletes **every** cache: the precache, `sde-data`,
the dogma engine and images (`staleBuildRecovery.ts:39-48`). Then it reloads.

**What the user sees offline.** The browser's "No internet" page. The
installed app will not open offline again until it is back online, and about
25 MB of warmed data has to be downloaded again.

**A second bug.** When recovery declines (within 60 s of a previous purge),
`preventDefault()` has already made the import resolve to `undefined`.
`guarded()` then never settles, so the user gets an endless spinner rather
than the error boundary the comment promises.

**Fix (S).**

- When offline, or when recovery would decline, don't call
  `preventDefault()` and don't purge. Let the import reject into the
  ErrorBoundary, with offline copy, and retry on `online`.
- When online, delete only `workbox-precache-*`.

### R6: there is no shared "you're offline" state (High/Medium)

- **No offline indicator on phones.** The only signal is the sync dot, which
  sits in the desktop-only rail and appears only when sync is configured
  (`Layout.tsx:388`). `DataAgeBadge` is also `hidden md:inline-flex`, so
  phones never see data age.
- **Error copy can't say "you're offline".** No feature code reads
  `navigator.onLine`. Every failure message is written as "ESI busy",
  "Try again shortly" or "check back shortly".
- **The cached-data notice is hand-written in 16+ places**, with no age.
  Several views that load ESI data never show `fromCache` at all:
  - Corp, CorpAssets, CorpMembers
  - PlanetaryIndustry at route level
  - `EventDetailModal`, Price History, the Wallet multi-character totals
  - the Standings tab, the Ships tab, Skill Plans and Certificates
  - the Overview header, which computes `fromCache` in `headerSummary.ts`
    but never shows it
- **Nothing recovers on reconnect.**
  - A failed revalidation keeps serving cached data for up to 10 minutes.
  - The sync status flips from Offline to a red "Sync error" for 5–20
    minutes.
  - Polls and the SDE warm don't re-run.
  - The foreground notification poller and the request-badge poll keep
    firing while offline.

**Recommended shared pattern.**

1. `src/stores/network.ts` with `useOnline()` and a single listener. It
   replaces the copies in `useSyncStatus.ts` and `useFirstRunReady.ts`. On
   `online` it should:
   - clear `revalidationFailures` and call `emitCacheRevalidated()`;
   - call `triggerSync` for the active character;
   - re-run the SDE warm;
   - give the poller a catch-up check.
2. In `esiFetch`, classify a fetch or token-refresh network failure as
   `EsiOfflineError` (not before the request: `navigator.onLine` is advisory),
   and add `offline: true` to the cache status
   result. Skip polls while offline.
3. A `components/ui/CachedNotice` primitive, with a story and a DESIGN.md §6c
   entry. It renders "Showing cached data · 3h ago" at every width, worded
   from `useOnline()`, and replaces the hand-written copies (including the
   duplicate `skills.offlineTitle` key).
4. A shell `OfflineBanner` at every width: "Offline — showing data saved on
   this device. Changes sync when you reconnect."
5. A **needs-a-connection guard** for SSO and re-auth buttons
   (`loginFlow.ts:87-102`: offline, they currently send the standalone PWA
   window to a browser error page), ESI writes, Firebase sharing and push
   opt-in. Disable the action and explain why in a tooltip.
6. A **Settings → Offline data** panel:
   - cached status for each data pack;
   - a storage estimate;
   - `navigator.storage.persist()`, which nothing calls today, so Dexie
     (including refresh tokens) and caches can be evicted;
   - a "Download everything for offline" button that ignores the cellular
     gate.

---

## 2. Gaps: things that could work offline but don't

| #   | Sev  | Feature                                                                    | Why it fails offline                                                                                                                                                                                                                            | Fix                                                                                                                                                                                          |
| --- | ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | High | **Industry, all tabs + plan + group pages**                                | Uncached `blueprints.json` rejects inside an uncaught `Promise.all` (`useIndustryWorkspace.ts:104-140`, verified). The page shows "Loading…" forever and throws away the owned blueprints it loaded from Dexie.                                 | Precache `blueprints.json`. Catch the load separately and show a "not downloaded yet, connect once" state with Retry. The plan list can render without the catalog (names are on each plan). |
| G2  | High | **Show Info / Item Detail modal**, row skills, Compare Attributes, hauling | They call raw `getUniverseType` (`ItemDetailModal.tsx:195`, `useOrderRowSkills.ts:45`, `useCompareAttributes.ts:76`, `haulingData.ts:171`, verified), which is never cached. Offline it always fails, even for an item opened a minute earlier. | Route them through the existing cached `loadUniverseTypeOnce` (`features/skills/data.ts`). (S)                                                                                               |
| G3  | High | **Fitting required skills**                                                | They come only from ESI `/universe/types`, and a miss returns `[]` (`fittings/skillRequirements.ts:14-32`). Offline, a fit reads as flyable, a plan's Fit Goal reads as met, and EFT-to-plan produces incomplete plans.                         | Treat "unknown" as unknown, as `useFittingAlpha` does (S). Generate a precached `requiredSkills.json` in build-sde (M), which also removes the per-type ESI fan-out when online.             |
| G4  | High | **Fitting catalogue** (Add panel, New from hull)                           | Needs `market/types.json`, `groups.json` and `variations.json`; on failure it stays null with no error state (`useFittingCatalogue.ts:80-96`). The user sees "Loading items…" forever, so no new fitting can be started offline.                | Precache those three files (≈290 KB gzipped), or build the catalogue from the precached `types.json`, `fittingSlots.json` and `groupCategories.json`. Add a failed state with Retry.         |
| G5  | Med  | **Fitting stats / editor**                                                 | The dogma engine (≈10 MB) is warmed only at the "all" level (not on cellular), 90 s after boot. Offline, the Add panel says "Ship data is still downloading…" forever and nothing can be added (`Fittings.tsx:347`).                            | Warm it on the first Ship Tree or Fit Goal visit, and offer it in the Offline data panel. Publish the engine's load state (idle, loading, failed) with offline copy.                         |
| G6  | Med  | **Ship Tree, masteries**                                                   | `shipTree.json` and `masteries.json` are lazy. The tree failure says "reload the page" with no Retry. Masteries failures are swallowed: "No Mastery data for this hull" and "You have no Mastery Level yet" are both false.                     | Precache `shipTree.json`. Slim `masteries.json` and precache it. Give the masteries load three states (loaded, none, not available offline).                                                 |
| G7  | Med  | **Build system name lookup**                                               | ESI-only `/universe/ids` (`industry/systemLookup.ts:44-77`). Offline it says "No solar system by that name". `market/systems.json` already has every name.                                                                                      | Resolve locally first; tell "couldn't check" apart from "not found". (S)                                                                                                                     |
| G8  | Med  | **System name and security** (Clones, assets in space, places, mining tax) | Fetched per id from ESI (`character/systemSecurity.ts:21-55`) even though `sde/solarSystems.ts` has them.                                                                                                                                       | Read the snapshot first. (S)                                                                                                                                                                 |
| G9  | Med  | **Character corp/alliance in header and roster**                           | `stores/publicInfo.ts:41-80` is memory-only and raw ESI, so it shows "Unknown" on an offline cold start.                                                                                                                                        | Use the esiCache-backed `loadPublicCharacterInfo` / `loadPublicCorporationInfo`. (S)                                                                                                         |
| G10 | Med  | **Unopened mail bodies**                                                   | Fetched only when opened. Opened bodies are cached and work offline.                                                                                                                                                                            | When online, prefetch the bodies of the newest or unread headers (bounded, about 50). A delivered body never changes. (M)                                                                    |
| G11 | Med  | **Communities list and library**                                           | Live Firestore only. Offline: "Could not load your Communities", with no Retry and no cached copy.                                                                                                                                              | Keep the last list and library snapshot in Dexie. Show them read-only, labelled "cached"; disable writes offline. (M)                                                                        |
| G12 | Med  | **PI link CPU/PG load**                                                    | Uncached `pi-planet-radius.json` falls back to `{}`, so colony headroom is understated without saying so.                                                                                                                                       | Persist the radius of the pilot's own colonies, or precache the file, or show "link load unknown".                                                                                           |
| G13 | Low  | **Calendar event details**                                                 | Only cached once opened.                                                                                                                                                                                                                        | Prefetch upcoming event details after the list loads.                                                                                                                                        |
| G14 | Low  | **Shared links / Survey**                                                  | Not cached after viewing. Survey reads Firestore every time.                                                                                                                                                                                    | Cache the payload until `expiresAt`, and the last survey with an age label.                                                                                                                  |
| G15 | Low  | **Implant data**                                                           | Bonuses and slots come from ESI per type, so an unseen implant shows as `#id` and its bonus is ignored by the scheduler.                                                                                                                        | A small precached `implants.json`.                                                                                                                                                           |
| G16 | Low  | **Region and constellation names**                                         | Route Safety and Incursions call raw `postUniverseNames` (`routeSafetyData.ts:96`, `incursionsData.ts:43`).                                                                                                                                     | Ship them in the snapshot, or cache them in esiCache.                                                                                                                                        |
| G17 | Low  | **Skill-book price**                                                       | Live only.                                                                                                                                                                                                                                      | Fall back to the SDE `basePrice` (`sde/types.ts`).                                                                                                                                           |
| G18 | Low  | **Mail mark-as-read**                                                      | Lost offline (`mail.ts:199-205`); the local mark lasts only for the session.                                                                                                                                                                    | Patch the cached header and queue the PUT.                                                                                                                                                   |
| G19 | Low  | **Order books, EVE-Scout list**                                            | Memory only. A failed refetch ignores the expired in-session copy.                                                                                                                                                                              | Serve the expired copy with an age label. Keep the EVE-Scout list in Dexie until `expires_at`.                                                                                               |
| G20 | Low  | **Build Location offline picks**                                           | Search is live (the failure copy is fine).                                                                                                                                                                                                      | Offer NPC stations from `market/stations.json` and remembered locations.                                                                                                                     |

---

## 3. Offline handled badly, by area

### Data integrity (fix first)

- **D1, High (verified): removing a character offline loses unsynced edits.**
  - `removeCharacterAfterSync` → `flushSync` gives up after 8 s, then deletes
    the local data (`features/character/removeCharacter.ts:40-51,87-97`; the
    comment admits "those edits are lost").
  - The remote alert grant and Community shares are left behind until the
    90-day purge.
  - On lie-fi the waits add up to about 24 s with no progress shown.
  - The confirm text ("adding back restores it") is false for unsynced edits.
  - **Settings → This device → Log out** (`logoutAll.ts`) has the same
    problem for _every_ character.
  - Fix: warn or block when offline or when the sync queue isn't empty
    (M/S). "Delete all data" already handles this correctly.
- **D2, High: an offline net-worth snapshot freezes stale data as today's
  final value.**
  - `recordSnapshots.ts:54-84` accepts results from cache, and the day then
    counts as "already recorded", so the online value never replaces it.
  - The row is synced to other devices.
  - Fix: skip when any source is `fromCache` or all prices are null, or
    write a provisional row that can be upgraded. (S)
- **D3, High: Open Orders shows false "Healthy" readings and writes them into
  undercut history.**
  - When Fuzzwork is unreachable, `beatsMe` is false for every order
    (`openOrdersModel.ts:214`, `orderCompetition.ts:82`).
  - `sampleableCharacterIds` (`orderProblemSamples.ts:40-43`, verified)
    accepts cached entries, so the false readings are recorded as samples.
  - Fix: add a "competition not checked" state, and don't record samples for
    tiers that weren't checked. (M)
- **D4, Med: Mining Tax Assign can save a 0 ISK assignment** when prices
  failed (`AssignDialog.tsx:188-205,281`). The assignment is saved and
  synced. Fix: warn or block on lines that are unpriced because the fetch
  failed.
- **D5, Med: "Clear cached ESI data" deletes the only copy offline**, with
  no confirm (`Settings.tsx:553-557`, verified). Fix: confirm first, and
  disable or warn when offline.

### False "nothing here" messages that should say "couldn't reach"

- **Corp board** (High). For each card, whether it shows is decided by
  corp-role capabilities, not by whether the read worked
  (`CorpKindCards.tsx:169`). A failed structures read therefore shows
  "Every structure is fuelled" or "No structure is on a timer". That is a
  dangerous false negative for fuel and timers.
- **CorpMembers** (High). A null tracking read becomes `[]`
  (`CorpMembers.tsx:190`), which shows "EVE reported no tracking rows for
  this corporation".
- **Contract detail.** Shows "No item data for this contract"
  (`ContractDetailModal.tsx:175,392`). `loadContractItemsDetailed` already
  separates a failed load from an empty list.
- **Standings.** Shows "No NPC standings yet" (`standings.ts:45-49` drops
  the status).
- **BPC Sourcing and Contract Search.** Show "No public listings synced yet
  — check back shortly".
- **Opportunities.** Show "No manufacturing blueprints found".
- **Market-wide scan.** Says "Nothing to build here… try a busier Trade
  Hub". Disable Run scan while offline.
- **zKill link import.** Says "That killmail couldn't be found"
  (`lib/zkillboard.ts:19-28` swallows the network error).
- **Fitting library.** In-game fittings can show "No fittings yet"; community
  fittings are dropped silently.
- **Ships tab, cross-character assets, Move plan.** Characters with no
  cached data are dropped without notice (`character/assets.ts:88-104`
  discards `skipped`).
- **Move plan.** Says "No hauler you can fly could be sized" when the
  fitting engine or catalogue isn't on the device.
- **Route Safety.** Silently drops jump-drive legs when
  `systemPositions.json` is missing (`routeJumpSettings.ts:66-82`).
- **Solar-system picker.** Empty, with no message, when `systems.json` is
  missing (`useSolarSystems.ts:16-18`). Affects Route, Move, Avoid and
  Settings.
- **Offline errors that blame the game client.** ESI writes say "ESI gave
  no reason. Is the character logged in to the game?" Affected:
  `sendWaypoints.ts:24-36`, `useSetDestination`, `useOpenInEve`, and Save
  to EVE ("Unknown error").
- **Order book.** Says "ESI didn't answer — it may be limiting requests".
- **Callback.** On a network failure it auto-redirects to SSO
  (`Callback.tsx:133-141`).

### Endless spinners from a rejection nobody catches

- **Industry**: G1.
- **LP Store**: `useLoyaltyStoreOffers.ts:101`, `useLpStoreSearch.ts:105`.
  Also, a corporation with no offers never becomes `ready`
  (`useLoyaltyStoreOffers.ts:179`). That second bug happens online too.
- **Stock Builder**: `StockBuilderView.tsx:74`. The Add-item search
  (`StockListDialogs.tsx:154`) is silently empty.
- **Ore decision dialog**: `OreDecisionDialog.tsx:154-180`.
- **Mining Overview with refining on (the default)**:
  `yieldSnapshot.ts:227-230`. The whole tab fails although the ledger is
  cached.
- **Appraisal with an active character**: `loadReprocessing()`
  (`appraisalData.ts:160`) fails the whole appraisal as "Couldn't load the
  market catalogue".
- **Market-wide trees**: `Industry.tsx:121-131`.
- **`LogProductionFromJobDialog`**: the button stays busy.
- **`FittingLoadCard`**: try/finally with no catch.
- **`usePlanEditorData`**: has no catch, and makes the local skill catalog
  wait on ESI.
- **Corp routes when roles were never cached**: `useCorpAccess` stays
  `unknown`.
- **`usePageItemActions`**: after one failure, "No blueprint options" for
  the rest of the session.

### Small polish

- **Wrong "fresh" timestamps on cached data:**
  - The Overview Location widget and Pilot Lookup stamp `new Date()` on
    cached data.
  - `useMarketSnapshot` / PI `planPrices` show prices read from disk as
    "just now".
  - The job fee becomes a silent 0 on the plan list, group and Compare when
    the cost index is missing (`resolveBuildPlan.ts:336`).
- **Network failures shown as raw or wrong messages:**
  - Mail send shows "Couldn't send: Failed to fetch"; it should say the
    draft is saved, and Send should be disabled offline.
  - RSVP shows a generic error.
  - Mail "Load more" does nothing visible.
  - Forward recipient search is silently empty.
- **Retry missing where the copy asks the user to reload instead:**
  - PublicInfoModal and SharedLink say "reload the page" or "try again"
    with no Retry button.
  - Price History has no retry.
- **No feedback, or a silent no-op:**
  - Characters "Refresh all" and the plan Refresh give no feedback when
    they fail.
  - "Share link" in Fittings probably hangs on Firestore. Offline it should
    copy the permanent `/share/fitting?f=` URL instead, which needs no
    server.
  - An offline shared appraisal link strips `?share=` and then does
    nothing.
- **Other:**
  - Assets location badges show "0 ISK" when there are no prices; item rows
    correctly show "–".
  - ErrorBoundary copy says "Reloading usually fixes this" for a chunk that
    can't load offline.
  - The Settings → Corporation defaults copy is misleading offline.
  - Sentry drops offline events (`makeBrowserOfflineTransport` would queue
    them).
  - The global paste router needs the market catalogue for every paste type,
    so offline a skill-plan or D-scan paste silently does nothing.

---

## 4. What already works offline

- **Cold start never waits on the network.** Boot update checks are skipped
  offline and capped on lie-fi. The Root, RequireCharacter and Login gates
  read only Dexie. All JS/CSS, locale chunks, `index.html` and the SPA
  fallback are precached.
- **Offline never signs anyone out or wipes data** (`isTotalAuthFailure`
  only reacts to `invalid_grant`). `cachePrune` is skipped offline. Network
  errors don't use up the ESI error budget.
- **ESI reads fall back to cache.** `loadWithCacheStatus` returns the stored
  row with `fromCache`. The 250 ms grace race keeps lie-fi fast when a row
  exists, and lapsed constants are served at once.
- **Editable data is local first:** skill plans, build plans and groups,
  production log, fittings and drafts, Mining Tax ledger actions, alerts
  (dismiss and snooze), travel settings and avoid lists, Ansiblex gates,
  Overview layout, and station pins. All work offline and sync later.
- **Fully local computation:** skill plan schedules and remaps, build recipes
  and Auto Build depth, PI routing, route planning (`localRoute.ts` keeps
  "unknown" separate from "no route"), countdowns, CSV exports, backup
  export and import.
- **Cached with an offline label:** Wallet balance, journal and LP; own
  orders; own transactions; contracts history; LP Store offers; Clones;
  Contacts; Employment History; Assets (with average prices served
  `allowStale`); Mail headers and opened bodies; Calendar; CorpWallet;
  Active Jobs; PI Colonies; BPC Sourcing; Contract Search snapshots; the
  Route Safety feeds.
- **Fitting import from text works offline:** EFT, DNA, chat links, share
  codes and XML.
- **Help, FAQ, Shortcuts and the Alerts panel are static or Dexie-backed.**
- **Images:** type art is cached cache-first and portraits
  stale-while-revalidate.

---

## 5. Suggested order of work

1. **R1**: the `isAuthFailure` network fix (S). This one change brings
   cached data back on almost every page in the commonest offline case.
2. **R5**: don't purge caches when a chunk fails to load offline (S).
3. **Data integrity**: D1 (offline guard on Remove and Log out), D2 (stale
   snapshot), D3 (false "Healthy"), D5 (confirm before clearing the cache).
4. **R4 precache**: `blueprints.json`, `shipTree.json`, the small
   `market/*` files, `systems.json`, `jumps.json`, `systemPositions.json`
   and `webp`. Add `systemPositions.json` to the warm, and retry the warm on
   `online`. This needs a scope decision amendment.
5. **G1–G4**: Industry failed state, cached Show Info, required skills,
   fitting catalogue.
6. **R3**: fetch timeouts (S each).
7. **R2**: stale price fallback with an "as of" label. Needs a scope
   decision.
8. **R6**: `useOnline` store, `CachedNotice` primitive, `OfflineBanner`,
   needs-a-connection guard, reconnect recovery.
9. False "nothing here" copy and the spinners from uncaught rejections
   (each S).
10. The remaining gaps (G5–G20), the Offline data settings panel and
    `storage.persist()`.
