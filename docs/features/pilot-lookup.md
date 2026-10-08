# Pilot Lookup

Intel group page `/pilot-lookup`. Find one pilot by name; see identity from public ESI and all-time + recent killboard figures from zKillboard. Its own page, not a Travel tab (scope decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`). Origin: issue #2331 (stats), #2332 (recent kills/fits), decision `20260929-234357`.

Glossary (CONTEXT.md): **Pilot Lookup** - portrait, corporation, alliance, character age from public ESI; all-time kills, losses, ISK, solo kills, danger and gang ratios, most-used hulls from zKillboard; newest 25 kills and losses, each expanding to the victim's fit with Open in Fittings (killmail read only then). Numbers, never a verdict: no pilot is called hostile or safe. "No zKillboard history" and "zKillboard couldn't be reached" are different answers.

## Feature summary

| Feature                      | Where                          | Notes                                                                                                                           |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Name search with suggestions | Search panel                   | Combobox, >= 3 chars, 300 ms debounce, max 15 hits; needs the active Character's search scope                                   |
| Exact-name lookup            | Search panel (Enter / Look up) | Public `POST /universe/ids`; works without the scope                                                                            |
| Shareable lookup             | URL `?pilot=<characterId>`     | Pushes history; opens on that pilot                                                                                             |
| Identity block               | Result                         | Portrait, name, corporation (link), alliance (link or "no alliance"), security status, age, zKillboard link                     |
| Stat tiles                   | Result                         | Kills, Losses, ISK destroyed, ISK lost, ISK efficiency, Solo kills                                                              |
| Ratio meters                 | Result                         | Snuggly <-> Dangerous, Solo <-> Gang (zKillboard's own 0-100)                                                                   |
| Top ships                    | Result                         | Up to 5 hulls used on kills, bars, Show info links                                                                              |
| Recent kills and losses      | Result                         | Newest 25 merged; expandable rows with victim fit + Open in Fittings                                                            |
| Pasted Local list / D-Scan   | Search box, global paste       | 2+ lines. Local: sortable table (danger, gang, kills), max 40 names; D-Scan: ships counted by class. Decision `20261007-224716` |
| Show Info Character tab      | `PublicInfoModal`              | Same `PilotProfileView` reused (corp/alliance switch tabs)                                                                      |
| Command palette              | Ctrl/Cmd+K                     | Page entry only                                                                                                                 |

## Access, routing, scopes

- Route `/pilot-lookup`, `ungated` (`src/app/routeScopes.ts:219`, comment: "Public ESI only, like Travel it came from"). Still needs a signed-in Character: `src/routes/PilotLookup.tsx` waits for `hydrated` then `Navigate to /characters` when none (`PilotLookup.tsx:21-26`).
- Nav: Intel group, `mobileTab: true`, icon `NavPilotLookup` (`src/app/navDestinations.ts:245`). Title `nav.pilotLookup`.
- Legacy redirects: `/travel/pilot` -> `/pilot-lookup` (`src/app/legacyPaths.ts:10`, query kept); defaulted `/travel?pilot=` -> `/pilot-lookup` (`src/routes/Travel.tsx:25-31`).
- Scope: only suggestions use one - `esi-search.search_structures.v1` (`getCharacterSearch`, `src/esi/registry.ts:573`), gated by `useEndpointsGranted(['getCharacterSearch'])` and an active Character (`PilotLookupPanel.tsx:75`). Without it the hint reads "Type the pilot's full name and press Enter. Suggestions need this character's search permission." and exact-name lookup still works. No grant banner or Grant button on the page.
- Layout: `mx-auto max-w-6xl`; `PageHeader` title `nav.pilotLookup`; no tabs; `DataAgeBadge` on the profile panel (when the profile loaded).

## Data sources

| Source                | Endpoint                                                                                  | Used for                                                                   | Code                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ESI (Character scope) | `GET /characters/{id}/search?categories=character` + `resolveNames`                       | Suggestions                                                                | `src/features/character/mailRecipientSearch.ts` (same search Mail's recipient picker uses; floor 3 chars) |
| ESI public            | `POST /universe/ids`                                                                      | Exact name -> id (case-insensitive)                                        | `resolvePilotByName`, `src/features/travel/pilotLookup.ts`                                                |
| ESI public            | Character public info (cached loader) + one direct `getCharacterPublicInfo` fallback      | Name, birthday, corporation, alliance, security status                     | `loadPilotProfile`                                                                                        |
| ESI public            | `POST /characters/affiliation`                                                            | Current corp/alliance (wins over the cached, possibly stale public record) | `resolveAffiliations`                                                                                     |
| ESI public            | `resolveNames`                                                                            | Corporation / alliance names                                               | `loadPilotProfile`                                                                                        |
| zKillboard            | `GET https://zkillboard.com/api/stats/characterID/{id}/` (302 -> `.../kills/`, CORS-open) | All-time stats, danger/gang ratio, top ships                               | `fetchPilotStats`, `src/lib/zkillboard.ts:228`                                                            |
| zKillboard            | `GET /api/kills/characterID/{id}/` and `/api/losses/characterID/{id}/`                    | Recent killmails (id, hash, inline body, total value)                      | `fetchPilotKillmails`, `zkillboard.ts:341`                                                                |
| ESI public            | `GET /killmails/{id}/{hash}`                                                              | Victim body only when zKillboard sent the hash-only shape                  | `loadKillmailFit`, `src/features/travel/pilotKillmailFit.ts`                                              |
| Local SDE             | `types.json`, fitting slot data                                                           | Hull/module names, slot placement                                          | `loadTypes`, `loadFittingSlots`                                                                           |

zKillboard calls are plain browser fetches with no custom headers (decision `20260924-195833`). Stats and killmail lists cached 10 min in memory per id (`PILOT_STATS_CACHE_MS`); a failure is never cached. No Firestore or Dexie involved.

## Search panel (`PilotSearch`, `PilotLookupPanel.tsx:71`)

- Form: labelled text input (`role=combobox`, `aria-autocomplete=list`), placeholder "Pilot name", `w-72`; primary "Look up" button (disabled when empty or while resolving).
- Suggestions: listbox below input (max-h 56, scroll), shown only when scope granted, trimmed length >= 3 and results exist. Keys: Arrow Up/Down, Home, End move highlight (opens list); Enter picks highlighted option else does exact-name lookup; Escape closes. Hover highlights; mousedown selects without blurring. Blur closes.
- Typing clears suggestions, resets state, cancels an exact lookup in flight (ticket counters make stale answers drop; aborts the search request).
- Search failure silently falls back to exact-name lookup (suggestions emptied).
- Status line (`role=status`, polite): resolving; not found ("No pilot is named X. Check the spelling - the name must match exactly."); couldn't reach EVE.
- Choosing a pilot sets input to the name and pushes `?pilot=<id>` (`setParams({ pilot }, { push: true })`).

## Result states (`PilotResult`, keyed by id)

| State                                  | Shown                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| no `pilot` param                       | EmptyState pickTitle / pickHint                                                |
| loading                                | Spinner                                                                        |
| `unknown` (ESI 404, no such character) | EmptyState "EVE has no pilot with this id. Check the link, or search by name." |
| `failed` (ESI unreachable)             | EmptyState "This pilot's details aren't available right now..."                |
| ready                                  | Panel with `PilotProfileView`                                                  |

Distinction rests on `publicInfoOrNull`: the cached loader folds "no such character" and "unreachable" into null, so one direct request separates 404 (null) from other errors (throw).

## Profile view (`PilotProfileView.tsx`)

Shared with `PublicInfoModal`'s Character tab (`src/components/PublicInfoModal.tsx:40`), which lazy-loads it and owns its own loading/failure; mount keyed by character id.

- Identity: `CharacterAvatar` (lg) + name heading (hidden in the modal via `hideName`); definition list: Corporation (`CorporationLink` -> Show Info; inside the modal a button switching tabs), Alliance (`AllianceLink`, or "No alliance"), Security status (1 decimal, or Unknown), Age ("N years, M days" from birthday, to last anniversary, UTC; Unknown for unreadable/future). External "zKillboard" link to `characterZkillUrl`. 44 px hit area on phone for the corp/alliance links (#2520). Unresolved corp/alliance names show `#id`.
- Loads `fetchPilotStats` on mount; fits section independent.

### Stats (`ZkillStatsSection.tsx`)

- Status (`ZkillStatsStatus`): loading ("statsLoading"), failed EmptyState, `no-history` EmptyState (no kill or loss recorded; wording differs for pilot / corporation / alliance). Failed vs no-history are separate answers.
- Ratio meters (`ZkillRatioMeters`): Danger (Snuggly 0 ... Dangerous 100) and Gang (Solo 0 ... Gang 100); `role=meter`; fill and readout coloured by the end it leans to (green low, red high, neutral at 50) and text names the end ("68% dangerous", "N% snuggly", even); InfoTooltip help. Hidden if zKillboard sent neither.
- Stat tiles (`StatTiles`, 6 columns from `md`, 2-3 on phone): Kills (green), Losses (red), ISK destroyed, ISK lost (`IskAmount`, compact with exact on hover), ISK efficiency (percent, 1 decimal, tooltip: destroyed / (destroyed + lost)), Solo kills. Note "All-time figures as zKillboard states them."
- Top ships (`ZkillTopShips`): up to `PILOT_TOP_SHIPS = 5` ranked rows: rank, `TypeIcon`, `ItemInfoLink` name, bar sized vs top hull, kill count. Half width on desktop. Names resolved with `loadTypeNames`.
- Parts exported for reuse: Corporation and Alliance tabs of Show Info reuse `StatTiles`, `ZkillRatioMeters`, `ZkillTopShips`, `ZkillStatsNote` with `fetchCorporationStats` / `fetchAllianceStats`.

### Recent kills and losses (`PilotKillmailsSection.tsx`)

- Fetches kills and losses in parallel, merges newest first by killmail id, keeps `PILOT_KILLMAIL_LIMIT = 25`. Either list failing fails the whole answer ("couldn't be loaded", warning tone) - kills alone would misstate the record. Empty: "zKillboard lists no recent kills or losses." Header link "More on zKillboard".
- Row (button, `aria-expanded`): caret, Kill (green) / Loss (red), timestamp (user time-zone setting), ship icon + hull name, system name, "Victim: <name>" (for kills) or "Final blow: <name>" (for losses) - pilot, else corporation, else NPC's ship type -, total value (`formatIskCompact`). Phone: party text takes its own last line.
- Expand: reads the killmail only now (inline zKillboard body, else ESI killmail by hash). Once read or in flight it is kept (no refetch on collapse/re-expand); a failed read retries on next expand. Spinner delayed 200 ms.
- Expanded states: loading; failed ("couldn't be read from EVE. Try again in a minute."); no fit ("wasn't in a ship that can be fitted"); empty fit ("Nothing was fitted."); else `FittingModuleList` with linked item names.
- Open in Fittings: encodes the victim's fit as a share payload (`encodeFittingShare`) and navigates to the Fittings editor (`fittingEditLocation`); busy state; error "couldn't be opened in Fittings."
- Names (pilots, corps, systems) resolved in one batched `resolveNames` as rows load.

## Other entry points

- Command palette Pages group lists "Pilot Lookup" (`createPagesProvider`, `src/features/commandPalette/providers.ts:25`). No pilot-name search or "look up <pilot>" command; no way to deep-link a lookup from the palette.
- No other page links to `/pilot-lookup`; `CharacterLink`s elsewhere open the Show Info modal's Character tab, which renders the same profile view.
- Share: copy the URL (`?pilot=<id>`).

## Engine / helpers

- `pilotAge(birthday, now)`: whole years to last anniversary (UTC) + days since; null for unreadable or future (`pilotLookup.ts:33`).
- `parsePilotStats`: defensive parse; `{"error":"Invalid type or id"}` or zero kills + losses = `no-history`; any other error body = failure; `iskEfficiency = destroyed / (destroyed + lost)`, null when no ISK moved; zero counts missing from the body read as 0 (`zkillboard.ts:166`).
- `parsePilotKillmails`, `readKillmailDetail`: drop entries without id/hash; final blow = flagged attacker else first listed.
- `killFigures`: tile data + tones (`zkillFigures.ts`). Danger/gang meters quote zKillboard's own scales (decisions `20261002-145207`, `20261002-163430`).

## Purpose and user goal

Answer "who is this pilot and what have they done" from facts: identity (public ESI) plus all-time and recent killboard figures (zKillboard). Typical goals: check a stranger before a contract, trade or fleet invite; share a link to a pilot. It never labels a pilot (decision `20260912-172628`; asserted by `PilotLookupPanel.test.tsx:210`).

## Where it lives

| Layer            | Path                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Route / gate     | `src/routes/PilotLookup.tsx` (waits for `hydrated`, redirects to `/characters` with no Character) |
| Page             | `src/features/travel/PilotLookupPanel.tsx` (search, result switch)                                |
| Profile (shared) | `src/features/travel/PilotProfileView.tsx`, `ZkillStatsSection.tsx`, `PilotKillmailsSection.tsx`  |
| Data             | `src/features/travel/pilotLookup.ts`, `pilotKillmailFit.ts`, `src/lib/zkillboard.ts`              |
| Figures          | `src/features/travel/zkillFigures.ts`                                                             |

Folder is `features/travel/` for history only (page left Travel, `20261002-145653-lp-store-under-market-pilot-lookup-its-own`).

## Formulas and parsing rules

| Rule                   | Exact behavior                                                                                                                                                                                 | Code                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Age                    | whole years to last anniversary (UTC) + whole days since; null (shown "Unknown") for unparseable or future birthday                                                                            | `pilotLookup.ts:33`                                  |
| Exact name             | trimmed, blank never asked; `POST /universe/ids`, first `characters` match, case-insensitive                                                                                                   | `pilotLookup.ts:48`                                  |
| Suggestion floor       | trimmed length >= 3 (ESI minimum); hits sliced to 15; names resolved via `resolveNames`; unnamed hits dropped                                                                                  | `mailRecipientSearch.ts:10-37`                       |
| Current affiliation    | `POST /characters/affiliation` wins over cached public record (static cache can be stale); alliance null when affiliation says none                                                            | `pilotLookup.ts:79`                                  |
| Unknown vs unreachable | cached loader returns null for both; one direct `getCharacterPublicInfo`: 404 = unknown, any other error rethrows = failed                                                                     | `pilotLookup.ts:64`                                  |
| Stats parse            | non-object / array = failure; `error == "Invalid type or id"` = no-history; any other error = failure; kills = `shipsDestroyed`, losses = `shipsLost`, missing counts = 0; both 0 = no-history | `zkillboard.ts:166`                                  |
| ISK efficiency         | `iskDestroyed / (iskDestroyed + iskLost)`; null (shown "—") if no ISK moved                                                                                                                    | `zkillboard.ts:184`                                  |
| Ratios                 | zKillboard's own `dangerRatio` / `gangRatio`, null if not finite; clamped 0-100, rounded; lean high > 50, low < 50, even == 50                                                                 | `ZkillStatsSection.tsx:233`                          |
| Top ships              | `topAllTime` bucket `type == ship`, first 5 (`PILOT_TOP_SHIPS`), bar width = kills / max kills                                                                                                 | `zkillboard.ts:101,141`                              |
| Recent list            | kills + losses lists merged, sorted by killmail id desc (ids rise with time), first 25 (`PILOT_KILLMAIL_LIMIT`); entries lacking id or hash dropped                                            | `zkillboard.ts:341`                                  |
| Final blow             | attacker flagged `final_blow`, else first listed; party label = pilot, else corporation, else NPC ship type name, else "—"                                                                     | `zkillboard.ts:283`, `PilotKillmailsSection.tsx:194` |
| Row columns            | Kill/Loss tag, timestamp (user time zone), VICTIM's hull icon + name (the hull that died, on kills too), system, party (Victim on kills, Final blow on losses), total value `formatIskCompact` | `PilotKillmailsSection.tsx:204-260`                  |

## Persistence and sync

| State                      | Where                                                                                 | Notes                                |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Selected pilot             | URL `?pilot=<characterId>` (`optionalIdParam`), `push` on select                      | only durable state; shareable        |
| Stats, killmail list       | memory, 10 min per `kind:id` / per id (`PILOT_STATS_CACHE_MS`); failures never cached | lost on reload                       |
| Public info                | ESI cache (Dexie, `STALE_AFTER.static`)                                               | via `loadPublicCharacterInfo`        |
| Expanded rows, loaded fits | component state, kept for the mounted pilot                                           | lost on pilot change (keyed remount) |
| Query text                 | component state only                                                                  | not restored from the URL            |
| Firestore / Dexie sync     | none for this page                                                                    |                                      |

## State matrix

| Where            | State                               | Display                                                  |
| ---------------- | ----------------------------------- | -------------------------------------------------------- |
| Search           | idle                                | hint (suggest vs exact wording)                          |
| Search           | resolving exact name                | "resolving" status; Look up disabled                     |
| Search           | not found                           | status "No pilot is named X..."                          |
| Search           | ESI failure                         | status "couldn't reach EVE"                              |
| Search           | suggestion request fails            | silent: list emptied, exact lookup still works           |
| Search           | scope missing / no active Character | no list; exact-name hint                                 |
| Result           | no `pilot` param                    | EmptyState pick title/hint                               |
| Result           | loading                             | Spinner                                                  |
| Result           | 404                                 | EmptyState unknown pilot                                 |
| Result           | other ESI error                     | EmptyState unavailable                                   |
| Stats            | loading                             | "statsLoading" line                                      |
| Stats            | failed                              | EmptyState stats-failed (distinct from no history)       |
| Stats            | no-history                          | EmptyState; wording for pilot/corp/alliance              |
| Stats            | ratios absent                       | meters hidden; tiles still show                          |
| Killmails        | loading / failed / empty            | status line / warning line / "no recent kills or losses" |
| Row expand       | loading                             | Spinner after 200 ms                                     |
| Row expand       | failed                              | retry on next expand                                     |
| Row expand       | no fit / empty fit                  | text lines                                               |
| Open in Fittings | busy / failed                       | disabled button / `role=alert`                           |
| Rate limiting    | zKillboard 429 or any non-ok        | same as failed; Try again control; no cache              |

## Mobile vs desktop

- Page `max-w-6xl`; search input `w-72 max-w-full`. Stat tiles 6 columns from `md`, 2-3 below; ratio meters side by side, stacked on phone; top ships half width on desktop (`md:w-1/2`).
- Killmail row: `min-h-11` on phone, party text takes its own last line below `sm` (#2520); corp/alliance links 44 px tall on phone (#2520).
- No separate mobile layout for search; `mobileTab: true` puts the page in the phone tab bar's More area.

## Permissions

| Feature                                        | Scope                                                    | Missing                                     |
| ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| Exact-name lookup, profile, stats, kills, fits | none (public ESI, zKillboard, ESI killmail)              | n/a; page still needs a signed-in Character |
| Name suggestions                               | `esi-search.search_structures.v1` (`getCharacterSearch`) | hint text only; no Grant button             |

## Test coverage map

| Behavior                                                                                                                                                                                                        | Test                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| age math, exact-name resolve, affiliation merge, 404 vs outage                                                                                                                                                  | `pilotLookup.test.ts`                                                                                                                                                                               |
| scope vs no-scope search, not found, deep link, unknown/outage/no-history/zKill failure distinctions, no-verdict copy, list without reading killmails, hash-only read once + Open in Fittings, killmail failure | `PilotLookupPanel.test.tsx`                                                                                                                                                                         |
| inline vs hash-only fit, ESI failure                                                                                                                                                                            | `pilotKillmailFit.test.ts`                                                                                                                                                                          |
| meters lean/colour/even, tile colours, efficiency help, top-ship ranking, corp "no history" copy                                                                                                                | `ZkillStatsSection.test.tsx`                                                                                                                                                                        |
| Not covered by a dedicated test                                                                                                                                                                                 | keyboard navigation of suggestions, debounce/abort race handling, Show Info modal reuse (stats parsing is covered by `src/lib/zkillboardStats.test.ts`, killmails by `zkillboardKillmails.test.ts`) |

## Decision links (why)

| Decision                                                                   | Gist                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `20260929-234357-travel-section-route-safety-thera-turnur-pilot-lookup`    | intel tools in scope; signed-in; numbers not verdicts                                                    |
| `20261002-145653-lp-store-under-market-pilot-lookup-its-own`               | own page `/pilot-lookup`, old links redirect                                                             |
| `20260930-104922-public-infos-character-tab-is-pilot-lookups-view`         | Show Info Character tab renders this view; caller owns corp/alliance links; live affiliation drives tabs |
| `20260924-195833-fittings-load-reads-killmail-hashes-from-zkillboards-api` | zKillboard calls are plain browser fetches, no custom headers (avoids preflight)                         |
| `20261002-163430-show-info-colours-zkillboards-figures-by-side-and`        | kills green, losses red, meters coloured by lean                                                         |
| `20260912-172628-courier-risk-flags-state-a-condition-never-a`             | conditions, never verdicts                                                                               |

## Interview Q&A

1. Why can a lookup work without the search scope? Exact name goes through public `POST /universe/ids` (`pilotLookup.ts:48`); only the suggestion list calls the Character-scoped search (`PilotLookupPanel.tsx:75`, `registry.ts:573`). Hint wording switches on `canSuggest`.
2. How does it tell "no such pilot" from "ESI is down"? The cached loader folds both to null, so `publicInfoOrNull` makes one direct call: 404 returns null (unknown), anything else throws (failed) (`pilotLookup.ts:64-72`; tested `pilotLookup.test.ts:143,150`).
3. Why prefer the affiliation lookup over public info for corp/alliance? Public record is cached as static and can be stale; `/characters/affiliation` is current, and wins when it answered (`pilotLookup.ts:79-96`). Show Info tabs follow the same ids so they never disagree (`20260930-104922`).
4. What is the difference between "no history" and "couldn't be reached"? zKillboard `{"error":"Invalid type or id"}` or zero kills+losses = no-history; any other error body, non-ok HTTP or fetch error = failed (`zkillboard.ts:166-193`, `fetchEntityStats`, `zkillboard.ts:211`). A failure is never cached, no-history is.
5. How is ISK efficiency computed and when is it blank? destroyed / (destroyed + lost), null when no ISK moved (`zkillboard.ts:184`); tile shows "—".
6. How are the danger and gang meters coloured, and what are their numbers? They quote zKillboard's own 0-100 figures (not computed here), clamped and rounded; > 50 red/high, < 50 green/low, == 50 neutral "even", with the end named in words (`ZkillStatsSection.tsx:233-266`).
7. Why is the recent list limited to 25 and how are kills and losses merged? Both lists fetched in parallel, merged by killmail id desc, first 25; either list failing fails the answer because kills alone would misstate the record (`zkillboard.ts:341-361`).
8. When is a killmail body fetched? Only when a row is expanded; inline zKillboard body else ESI `GET /killmails/{id}/{hash}`; result kept once landed or in flight (ref guard), failed read retries on the next expand (`PilotKillmailsSection.tsx:106-126`, `pilotKillmailFit.ts:20-40`).
9. What does Open in Fittings do? Encodes the victim's fit as a share payload (`encodeFittingShare`) and navigates to the Fittings editor via `fittingEditLocation`; busy/failed states local (`PilotKillmailsSection.tsx:296-310`).
10. How do suggestions avoid stale results? Ticket counters (`latestSearch`, `latestLookup`), 300 ms debounce, `AbortController` on cleanup; typing clears suggestions and cancels exact lookup in flight (`PilotLookupPanel.tsx:82-110`).
11. What happens to the previous result while typing a new name? It stays: typing resets only the search status and suggestions; the result changes only when a pilot is chosen and `?pilot=` is pushed (`PilotLookupPanel.tsx:177-190`, `:51-56`).
12. Who else reuses this? `PublicInfoModal`'s Character tab lazy-loads `PilotProfileView` and the stat parts for corporation/alliance (`PublicInfoModal.tsx:53,268`); corp/alliance links there switch tabs instead of opening Show Info.
13. How is a kill row's "ship" chosen? The victim's hull (`detail.victim.ship_type_id`) on both kills and losses; the party column is the other side: victim for kills, final blow for losses (`PilotKillmailsSection.tsx:204-208`).
14. Why are zKillboard requests plain `fetch` with no headers? A custom header would force a CORS preflight; decision `20260924-195833`; hence also no `X-User-Agent` (the CLAUDE.md ESI header rule covers ESI calls only).

## Observed gaps (from code)

- No pilot-name search or lookup command in the command palette; palette lists the page only.
- No Grant control on the page when suggestions lack the search scope; only a hint (`PilotLookupPanel.tsx:232`).
- Name search is exact-match only without the scope (first `characters` match, no disambiguation, no partial-name search via public ESI).
- Kills/losses list fixed at 25 with no pagination, filter or sort; "More on zKillboard" is the only way further.
- No employment history, standings or contact add on this page.
- No copy-link or share button; sharing relies on the address bar.
- The badge dates the profile load only; stats/killmail cache is memory-only (10 min, reload refetches) and shows no age.
- Profile, stats and killmail failures each offer a Try again control (failures are not cached, so it refetches).
- Killmail row shows only victim or final blow; no attacker count, damage, or location detail.
- Top ships use zKillboard's all-time "ships used on kills" only; no losses-by-hull or recent-activity timeline.
- Show Info Character tab and this page duplicate one view; Show Info does not link to `/pilot-lookup`.
- Orphaned i18n key `travel.pilotTab` (`src/i18n/locales/en.json:8405`) remains from when Pilot Lookup was a Travel tab.
- Opening a `?pilot=` link leaves the search box empty (query text is local state, never filled from the URL or the loaded profile).
- Kill row shows the victim's hull for both kills and losses, so the pilot's own ship on a kill is not shown.
- No test for keyboard navigation or the debounce/abort race beyond happy paths.

## Improvement ideas

- Fill the input from the loaded pilot; show a Copy link control.
- Retry button for fits; surface 429 distinctly.
- Pagination or "load more" and side filter (kills/losses) on the recent list; show attacker count and damage.
- Losses-by-hull and recent-activity timeline from zKillboard stats.
- Grant button next to the suggestion hint when the search scope is missing.
- Palette command "look up <name>" that deep-links `?pilot=`.
- Employment history and standings/contact actions behind the existing Show Info tabs.
- Drop the orphan `travel.pilotTab` i18n key.
