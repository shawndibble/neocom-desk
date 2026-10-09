# Contracts — feature inventory

Route `/contracts` (`src/routes/Contracts.tsx`). Economy nav group, mobile tab (`src/app/navDestinations.ts:207`). Tabbed (`CONTRACTS_TABS`, `src/app/pageTabs.ts:103-110`): three tabs, one page. Terms per `CONTEXT.md`: **Contract Search**, **Public Contract Offers snapshot**, **Public Courier Contracts snapshot**, **Published Snapshot**, **Offer**, **Going Rate**, **Jump Basis**, **Jump Range**, **Multi-Type Contract**.

User goal by tab:

- **Item search**: find the cheapest public item_exchange/auction listing of any item, anywhere in New Eden.
- **Courier**: find hauls worth taking, ranked by pay per jump, with scam/strand risk stated.
- **History**: see this Character's own issued/accepted contracts and open one for detail.

## Summary

| Feature                                             | Where                                                                       | Notes                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Item search tab `/contracts/search/items` (default) | `ContractSearchPanel.tsx`                                                   | ranked name search over public offers, 8 filters, suggestions, stats, detail modal |
| Courier tab `/contracts/search/courier`             | `CourierResults.tsx`                                                        | hauls as routes: filters, ISK/jump, risk markers, detail modal                     |
| History tab `/contracts/history`                    | `Contracts.tsx:601-691`                                                     | Character's own contracts, filter chips, column picker, export, detail modal       |
| Remembered landing tab                              | `contractSearchModePref.ts`                                                 | bare `/contracts` opens last of Items/Courier; History never remembered            |
| Public contract detail modal                        | `features/contracts/PublicContractDetailModal.tsx`                          | merged lines, two-sided headings, market value per side                            |
| Courier detail modal                                | `CourierContractDetailModal.tsx`                                            | rate hero, route + path, risks, going-rate benchmark, reverse lane                 |
| Character contract detail modal                     | `features/character/ContractDetailModal.tsx`                                | everything the in-game window shows                                                |
| Remembered courier filter                           | `courierFilterPref.ts`                                                      | all fields but text query and route preference                                     |
| Column pickers (3 tables)                           | `contractsColumns.ts`, `contractSearchItemsColumns.ts`, `courierColumns.ts` | device-local                                                                       |
| Exports                                             | `useTableExport`                                                            | surfaces `contracts`, `contract-search`, `courier-contracts`, `contract-items`     |
| Jump Range filter + Current System picker           | Items tab filter bar                                                        | measured on the stargate graph under the Jump Basis                                |
| PLEX-ask pricing                                    | `engine/contracts/contractSearch.ts`, `features/market/plexPrice.ts`        | converts PLEX ask to ISK at the global-market sell price                           |
| Notifications                                       | `features/notifications/events.ts:165-195`                                  | contract accepted/completed/failed, courier delivery due                           |

## Route, tabs, URL

- Tab ids are full path suffixes: `search/items`, `search/courier`, `history`; `/contracts/search` alone names no tab and redirects to Items (`pageTabs.ts:96-110`). Old Search-tab links still open.
- Bare `/contracts` lands on the last-used of Items/Courier (`useRememberedPageTab`, `Contracts.tsx:362`). Only picking Items or Courier stores it (`setRememberedMode`, `Contracts.tsx:365-375`); a link naming a tab, even `search/items`, wins. Decision `20260912-200030-contracts-opens-on-search-not-history`, `20260912-141100`.
- Route `UNGATED` (`routeScopes.ts:230`): History needs a scope but Search does not, and Search is the landing tab, so a page gate would put a re-login wall in front of it. Decision `20260912-200442-contracts-is-ungated-its-scope-is-gated-per`.
- No active Character → `/characters` (`Contracts.tsx:550`). Search tabs still require an active Character (they need a session and a location ACL identity).
- URL state (ADR `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`):
  - Items: `items.q`, `items.type`, `items.region`, `items.maxPrice`, `items.minQty`, `items.kind` (exchange|auction), `items.hideAuctions`, `items.hidePlex`, `items.jumps`, `items.sort` (default price asc).
  - Courier: `courier.q`, `.origin`, `.dest`, `.space` (set), `.hideRisky`, `.overRate` (all|only|hide), `.minReward`, `.maxCollateral`, `.maxVolume`, `.minDays`, `.pref`, `.sort` (default iskPerJump desc).
  - History: `history.q`, `history.status`, `history.type`, `history.sort` (default issued desc).
  - `highlight=<contractId>` pulses a History row (target of `contractAccepted` alerts and of the wallet journal "Contract" link).
- Header per tab: History shows `DataAgeBadge` of the contracts fetch, export menu, Refresh. Search tabs show a `DataAgeBadge` of the snapshot's `lastSyncedAt` (when the backend last crawled, not when the browser read it) and one Refresh that reloads both snapshots (`Contracts.tsx:563-594`). Export button is History-only in the header; Items and Courier export from inside their filter bars.

## Data sources and scopes

| Data                                            | Loader                                                     | Source                                                                                                                         | Scope                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Own contracts                                   | `features/character/contracts.ts` `loadContracts`          | `getCharacterContracts` paged, `truncated` flag                                                                                | `esi-contracts.read_character_contracts.v1`                                                                   |
| Own contract items (on modal open)              | `contractItems.ts`                                         | `getCharacterContractItems`; cached `STALE_AFTER.static` (lines fixed at issue)                                                | same                                                                                                          |
| Public contract items (on modal open)           | `features/bpcContracts/publicContractItems.ts`             | `getPublicContractItems` public route; global-sentinel cache; 404 cached as `not-found`                                        | none                                                                                                          |
| Public offers                                   | `contractSearch/publicContractOffers.ts`                   | Firestore `publicContractOffers` (EVE Ref crawl, republished every 30 min), cache key `publicContractOffersAll`, 30 min window | none, but needs a Firebase session (`ensureAnySession`) and a build with sync configured (`isSyncConfigured`) |
| Public courier                                  | `publicCourierContracts.ts`                                | Firestore `publicCourierContracts`, one small chunk (~620 rows at ADR 0013 sizing)                                             | same                                                                                                          |
| Item names                                      | `contractSearchNames.ts` `useListedTypeNames`              | SDE then `postUniverseNames`                                                                                                   | public                                                                                                        |
| Courier endpoint names                          | `courierEndpoints.ts`                                      | local `stations.json`/`systems.json` only, never ESI                                                                           | none                                                                                                          |
| Offer locations/system/security                 | `offerLocations.ts`                                        | local SDE                                                                                                                      | none                                                                                                          |
| Region names                                    | `useRegionNames`                                           | public `getUniverseRegion`                                                                                                     | public                                                                                                        |
| Contract location names                         | `features/character/contractLocationName.ts`               | SDE station membership decides NPC vs structure; structure → `getUniverseStructure` (ACL; null = unknown, retried)             | `esi-universe.read_structures.v1`                                                                             |
| Issuer/receiver names, affiliations             | `names.ts`, `affiliations.ts`                              | `postUniverseNames`, affiliation endpoint                                                                                      | public                                                                                                        |
| Standing tags                                   | `loadContacts`                                             | own contact list                                                                                                               | contacts scope, optional (absent → no tag)                                                                    |
| Market value in modals                          | `contractMarketValue.ts` → `market/prices.ts getHubPrices` | Fuzzwork hub aggregates (ADR 0002), sell min at reader's Trade Hub                                                             | public                                                                                                        |
| PLEX price                                      | `features/market/plexPrice.ts`                             | cheapest sell order in PLEX's global market region                                                                             | public                                                                                                        |
| Current location (jump range, "from my region") | `character/location.ts`                                    | `getCharacterLocation`                                                                                                         | `esi-location.read_location.v1` optional                                                                      |
| Travel rules                                    | `useJumpBasis`                                             | Settings → Travel + Route Safety saved settings                                                                                | none                                                                                                          |

- Shared `chunkedSnapshot.ts`: reads `meta` doc + N chunk docs of `rows`, cached under `GLOBAL_CACHE_CHARACTER_ID`, `allowStaleServe: true` so a lapsed row renders while the new read runs (issue #963). `fromCache` marks a failed revalidation (warning copy); `revalidating` shows "Refreshing in the background…" (`role=status`). Manual Refresh cannot beat the 30-min window by design (nothing newer exists); decision `20260912-160012-each-contract-search-board-loads-on-its-own`.
- Each board has its own `useRouteSnapshot` so Courier never waits for ~370k offer rows (#963).
- Rate limiting: no ESI call per row on any search surface (local snapshots), by design to stay under the 100-errors/min budget; structure name probes are per modal open.

## Item search tab

Panel without title; table label "Contract Search". Mounts only after snapshot load.

States (in order, `ContractSearchPanel.tsx:964-1031`):

1. Build without sync: "Contract search isn't available / requires the app's sync backend".
2. `fromCache`: "offline" or (after a refresh) "refresh failed" line; `revalidating` status line.
3. Loading with 0 rows: spinner "loading offers" plus visible copy (first sync is slow).
4. Error: "Couldn't load".
5. 0 rows: "No public contracts synced yet … check back shortly" (separate copy for courier).
6. Rows: filter bar + table.

### Filter bar (`FilterBar`; below md a funnel sheet with active-count badge; search stays inline)

- Search box "Search item name…": ranked search (`rankedSearch`) over only item types currently listed (`listedContractTypeOptions`), limit 50 types for free text; `deferredTypeQuery` so a keystroke does not stall on ~370k rows (#2024).
- Region (`RegionSelect`, searchable; only regions present in rows) → `items.region`.
- Max price (`IskInput`, shorthand ok). Min quantity (number).
- Sale kind chips Exchange / Auction (toggle; `items.kind`).
- Exclude (`CheckboxSelect`): Hide auctions; Hide PLEX requests (tooltip "Hide contracts asking for PLEX in return, rather than ISK").
- Jump range (`JumpRangeSelect`): Any, current system only, 3/5/10/15/20 jumps under the Jump Basis. `CurrentSystemPicker`: game location by default or a hand-picked system, stored device-local per Character (`currentSystemPicks`), writes immediately (not part of the draft). `JumpRangeNote` explains missing origin.
- Column picker (button "Columns") + export menu in the bar's actions.
- Active count: counts controls touched (half-typed `1e` still counts), not parsed values.

### Suggestions and type pinning

- Typing shows up to 8 suggestions ("name — N offers · cheapest ISK"), only types that still have offers after the other filters (stats computed on `nonTypeRows`, so counts match what the table will show).
- Click → pins `items.type` and sets text to the name; a `StatChips` row shows Offers, Cheapest, Median plus **Clear item** button (`contractOfferPriceSummary`). Typing anything else unpins.

### Table

- Columns: Item (always; plain accent text since the row opens the modal), then optional Qty, Price, System (+ security), Jumps, Region, Expires. All default visible, device-local `contractSearchItemsVisibleColumns` (non-empty list required).
- Default order cheapest first. Unpriced rows (barter, 0 ISK, or PLEX ask with no PLEX price) sort last in the default view and under the Price column sort in either direction (sortValue `undefined`), issue #1080.
- Price cell: `IskAmount` (compact, long-press exact); auctions get a suffix "Buyout" or "Starting bid"; PLEX asks show "includes N PLEX"; barter shows "unpriced" marker.
- System cell: "…" while resolving, "—" if unplaced (player structure), else name + `SecurityStatus`.
- Jumps cell: loading / value / unavailable hint (`renderJumpsCell`), link opens route to system.
- Row click opens `PublicContractDetailModal`. Right-click / More-actions: `BuildPlanContextMenu` with `seedFromOfferRow` (a blueprint copy seeds a Build Plan at its own ME/TE/runs, all-or-nothing, decision `20260912-111911`).
- Phone: `stackLayout="dense"` two-line cards (title + Price corner; meta "Qty · System · Region · Exp"), `mobileSort`, summary "N offers". Virtualized.
- Empty filter result: "No filter matches" + **Reset filters** (clears all 8 fields). While type names still load and a query is typed: spinner "naming types" instead of false "no matches".
- Row key includes index (a contract lists the same type once per stack).

### Formulas (src/engine/contracts/contractSearch.ts)

- Asking price = auction buyout if `> 0` else row price; EVE Ref emits `buyout: 0` on non-auctions, and `buyout` is ignored outright when not an auction (`engine/contracts/contractSearch.ts:50-76`).
- PLEX ask: price = ISK part + `requestedPlex × plexPrice`. No PLEX price → row is "unpriced".
- Unpriced = asking price ≤ 0 (barter) or PLEX ask without PLEX price. Treated the same as a free give-away (indistinguishable) — safer than showing it as cheapest. Decision `20260915-102046-zero-price-contract-treated-as-unpriceable-barter-marked`.
- Max-price ceiling asks "could this exceed my ceiling": auction without buyout has unknowable price → passes; PLEX ask with unknown PLEX price → passes (`priceForMaxFilter`).
- Multi-Type Contract: price treated as unknowable, never split per line (decision `20260915-093419`).
- Jump range: rows placed but unreachable (player structure or off-graph) drop once a range is set; rows still resolving stay (only a finished answer excludes).
- Stats: per type offerCount; cheapest ignores unpriced; median over priced.

### Public contract detail modal

Opened by an Items row (title = item name). Header `StatChips`: Price (full sentence: buyout/starting bid/incl. PLEX), Qty, plus ME/TE and Runs for a copy. Grid: Region, System (Route Safety link, when known), Location (spinner then name or "Unknown location (#id)"), Expires, Contract id with copy button (`CopyContractIdButton`, 1.5 s check). Contents:

- Lines merged per item (`mergeContractItemLines`), icon, name → Show info, ×qty, ME/TE/runs on copies.
- Two-sided item_exchange: "What you hand over" (requested) first, then "What you get" (included); one-sided shows "Everything on this contract" or "What you hand over" when only requested (decision `20260912-190109`).
- Market value row per side: sum of sell-min × qty at the reader's Trade Hub (PLEX at global price) with "(N items unpriced)" suffix; neutral colour on purpose (no side known). Priced unconditionally since every public row is standing.
- States: spinner; load fail "Couldn't load"; ESI 404 → "Contract no longer listed — may have expired, been fulfilled, or withdrawn" (ordinary after a 30-min-old snapshot); no lines "No item data".
- Each line has the Build Plan context menu (seeded at that line's own ME/TE/runs).

## Courier tab

Purpose: hauls as routes. Own component because a haul has no item/quantity/price (decision `20260912-065131`). Default rank ISK per jump desc (`20260912-141100`); ISK/m³ is the secondary (`20260912-143620`).

### Filter bar

Search "Search pickup or drop-off…" (station or system name, either end). Pick up From region + **From my region** button (one `getCharacterLocation` on first press, region from local `solarSystems.json`; states: disabled while pending, "unavailable" if no grant/offline/unplaceable, "No hauls from my region" if none start there — never a re-auth banner). To region. Destination space chips (only bands actually present; with every band selected it is no filter, so unplaced destinations stay visible; `narrowsSpace`). Min reward (ISK), Max collateral (ISK), Max volume m³, Min days. Route preference select (Travel route kinds; `courier.pref`, absent = Settings → Travel default). Pay vs going rate select: Any / Only far above / Hide far above. Chip **Hide risky routes** (tooltip: hides player-structure drop-offs and ends no stargate reaches; nullsec stays).

Persistence: all but `courier.q` and `courier.pref` are remembered device-local (`contractSearchCourierFilter`) as defaults for fields a URL leaves out; never mirrored back to the URL; URL wins (`useRememberedUrlParams`, decision `20260922-221531`/ADR 0015). Rejected whole if any stored field is invalid.

### Table

Route (always): origin system + security + region + risk markers, then "→" destination likewise. Optional (device-local `courierVisibleColumns`): Reward, Collateral ("—" if none asked; real zero is a distinct offer), Jumps, ISK/jump (+ going-rate multiple line and Over-rate marker), ISK/m³, Expires. Default sort ISK/jump desc; rows with no rate sort last either direction. Before jump counts land, order is by reward and ISK/jump cells show "…". Volume and deadline are filters and modal figures, not columns (decision `20260912-141100`).

Phone: dense cards; hauls between the same two systems fold into a **lane** group (collapsed by default) whose header shows lane, N hauls, regions, best ISK/jump, and the union of members' risk markers (so bait in a collapsed lane is not hidden). Summary "N hauls · M lanes". `groupBy` laneKey (system pair; unplaced ends never group).

States: no rows "No public courier contracts synced yet"; filtered empty "No courier contracts match" + Reset (reset restores `DEFAULT_COURIER_FILTER`); when a narrowed Space filter is why it is empty and unplaced destinations exist, a specific hint says so; jump snapshot unreadable: "Jump distances are unavailable right now, so hauls are ranked by reward."

### Formulas (src/engine/contracts)

- `iskPerJump = reward / max(jumps,1)`; null if jumps null; same-system (0 jumps) pays full reward (`courierRates.ts`).
- `iskPerVolume = reward / volume`; null if volume ≤ 0.
- `rewardPerVolumeJump = iskPerJump / volume`; null if volume ≤ 0 or jumps null.
- Going Rate = median of `rewardPerVolumeJump` over the **whole** corpus (not the filtered set), only if ≥ 20 samples (`MIN_GOING_RATE_SAMPLE`); else no multiple anywhere. Multiple = rate / going rate (null if either missing or going rate ≤ 0).
- Over-rate flag: multiple ≥ 8 (`FAR_ABOVE_MULTIPLE`). Derived: honest small hop ~3.6x, documented bait ~20x–900x. Rows with no multiple are never removed by either over-rate direction; until distances land the filter is not applied.
- Community floor reward = `collateral/1e9 × max(jumps,1) × 1e6` (1M per billion collateral per jump); null if collateral ≤ 0 or jumps null. Share = reward/floor; "below floor" if < 1.
- High collateral: `collateral / reward ≥ threshold` (default 50, `HIGH_COLLATERAL_RATIO`; reward ≤ 0 → null). Threshold is a synced setting `sync.courierHighCollateralRatio` with presets 20/50/100/200 (`collateralThreshold.ts`, set in `routes/Settings.tsx`); decision `20260925-234907`, `20260926-195118`. Modal-only, no row marker (`20260912-172628`, issue #1720).
- Freighter note: volume > 350,000 m³ (`FREIGHTER_VOLUME_M3`); warning tone only when route crosses ≤0.5 systems. Observed: a known freighter-gank contract runs 0.8x going rate, so rate alone misses it.
- Hours to expiry floored, min 0, pinned at modal open.
- Endpoint risks (`courierRisk.ts`): `player-structure` only for the **destination** and only when endpoint resolution is `structure`; `no-gate-route` when the end has no stargates or region id in [11,000,000, 12,000,000) (wormhole), and then nothing else (so Thera does not also read nullsec); `gank-chokepoint` (named list `route/chokepoints.ts`); `nullsec` note. `blocksCompletion` = structure or no-gate; nullsec never blocks. Marked-on-row risks: structure, no-gate, over-rate, chokepoint (nullsec is deliberately unmarked: the security number already shows). Warning set adds high-collateral.
- Reverse lane: swaps the two region filters; count narrowed by the same completable and over-rate stages as the board; separately counts "unplaceable" return hauls; zero is plain text, never a dead link (`courierReverseLane.ts`).
- Principle: every flag states a condition and consequence, never a verdict on the contract or player (decision `20260912-172628`); app cannot read access lists, cargo or intent.

### Courier detail modal (`CourierContractDetailModal.tsx`)

Hero: Reward (`IskAmount`, exact below) and ISK/jump (accent when a rate exists, with "over N jumps" span, "same-system" span for 0 jumps, "loading" while pending). Route section: Pick up name + place line ("Structure · System sec · Region"), jump count (clickable caret toggles the actual path when known and >1 system; path lists systems with security and chokepoint tags), Drop off likewise, then reverse-lane line (link with count, plain none/unresolved text). Risk list headed "Before you accept" (warning) or a note heading when only notes. Going-rate benchmark: multiple vs corpus, community floor line, freighter note, route exposure (chokepoints list, "crossed N systems at 0.5 or below", no-route/unknown/measuring), expiry in hours. Figures grid: Collateral (ratio note; "none asked" note), Volume (+ISK/m³), time to deliver (days, "once accepted"), listing expires, contract id. No network fetch of its own except one route path on open (`routeExposure`), measured under the board's Jump Basis (key changes while open reads "measuring").

## History tab

Purpose: the Character's own contracts.

- Filter bar: search "Search issuer, receiver or title…" (resolved issuer or receiver name or title; `filterContracts`), Status chips (only statuses present, canonical order), Type chips (only types present), column picker, count badge counts status+type (text excluded). URL `history.*`.
- Table: Type column is a button (accent) that opens the detail modal (row itself is not clickable); label = title, else type label; an untitled courier shows "Start → End" route names (resolved via `contractLocationName`) and a collateral meta line. Optional columns (device-local `contractsHistoryVisibleColumns.v3`): Status (tone by status; outstanding past `date_expired` shows a warning icon + tooltip "Outstanding and past its deadline — lapsed and unclaimed", flips live on a 60 s ticker), Issuer (+ standing tag), Received by (acceptor, else assignee with "(offered)" hint; null when it is you), Price/reward (`contractAmount`: courier = reward ?? price, else price ?? reward), Issued, Expires (accepted courier shows "Due <time> · in <countdown>" or red "Overdue", from `courierDeliveryDeadlineMs`, never `date_expired`).
- Sort default Issued desc; `virtualize="auto"`; `highlightRowKey`.
- Banners/states: offline; truncated "Incomplete" + **Try again**; empty "No contracts cached/ No contracts"; filtered empty with **Reset filters** (only when a filter is on); needs-reauth `GrantBanner` for `getCharacterContracts`; error "Couldn't load".
- Export (`contracts` surface): filtered rows sorted as on screen. Columns Type (title or raw slug), Status (raw slug), Issuer, Received by, Price, Expires (raw ISO).

### Character contract detail modal

Mounted only while selected. Summary rows (immediate): Type, Status, Issued by (+standing), Received by, Availability (Public/Private/Corporation/Alliance), Contract id (copy), Location, Destination (spinner then name or `#id`), Date issued/expires/(deliver by)/accepted/completed, Days to complete, Volume. ISK block shows only present fields: Acceptor Pays (price), Acceptor Receives (reward), Collateral, Buyout, neutral colour (side unknown). Items (item_exchange and auction only): Included / Requested tables (Name with icon + Show info, Qty), each with its own export (`contract-items`, filename qualifier contract id + section), compact density, row More-actions with Build Plan menu. For **outstanding** contracts only, a "Market value at <hub> (sell orders)" row per side with unpriced count (history is not a decision). Labels follow ESI fields not the game's "Buyer Will Pay" framing, which flips by side.

## Mobile vs desktop summary

Dense cards and mobile sort on both search tabs; filters in a funnel sheet; panel frameless on phone (`max-sm:-mx-2`); lane folding Courier only; History is a regular table with a 44px-high type button; modals reflow.

## Interview Q&A

1. **Why is `/contracts` ungated if it needs a scope?** Search needs none and is the landing tab; History gates itself with `GrantBanner`. `src/app/routeScopes.ts:230`, decision `20260912-200442`.
2. **Where does Item search data come from, and how fresh is it?** Firestore `publicContractOffers`, republished every 30 min from EVE Ref's archive (ESI has no public contract search); client window 30 min, stale rows served while revalidating. `src/features/contractSearch/publicContractOffers.ts:25-37`, `chunkedSnapshot.ts:73-136`.
3. **Why does a barter contract sort last, not first?** Its ISK price 0 is the absence of a price (issue #1080); a PLEX ask without a PLEX price is also unpriced. `src/engine/contracts/contractSearch.ts:84-96` (`isUnpricedOffer`), `ContractSearchPanel.tsx:203-219`.
4. **How is a PLEX-asking offer priced and filtered?** ISK + PLEX×cheapest global sell; max-price ceiling lets it pass if PLEX price is unknown. `engine/contracts/contractSearch.ts:68-76,102-106`.
5. **What makes a courier "over rate"?** reward per m³ per jump ≥ 8× the corpus median, which needs ≥ 20 rated rows and jump counts. `engine/contracts/courierGoingRate.ts:31,71`.
6. **Why is the going rate computed over the whole corpus, not the filtered rows?** A median that moved with every filter would compare against what is on screen rather than the market. `CourierResults.tsx:1039-1047`.
7. **What does "Hide risky routes" hide, and why not nullsec?** Player-structure drop-offs and ends no gate reaches; nullsec is ordinary paid work. `courierRisk.ts:133-140`, tooltip `contractSearch.hideUncompletableTooltip`.
8. **Why is the player-structure risk delivery-only?** An inaccessible pickup is arguably the same trap but widening is left to a follow-up. `courierRisk.ts:82-103` comment.
9. **How does "From my region" avoid an ESI burst or a re-auth banner?** One location read on first press, region from a local snapshot, every failure folds to "unavailable". `characterRegion.ts`, `CourierResults.tsx:297-358`.
10. **What is remembered across visits vs in the URL?** Tab mode (Items/Courier), courier numeric/chip filters, columns, current-system picks: device-local; everything else URL; URL beats remembered. `courierFilterPref.ts`, `contractSearchModePref.ts`.
11. **Why does a History row show an untitled courier as a route?** Three in-progress hauls would all read "Courier" (#1706). `features/character/ContractIdentity.tsx`.
12. **Why does an accepted courier's Expires show a countdown to delivery?** `date_expired` is the accept-by deadline; for a courier with status `in_progress` the delivery deadline is `date_accepted + days_to_complete × 86,400,000 ms` (null if days missing/≤0 or no accept date; `src/engine/courierDeadline.ts:22-29`). `Contracts.tsx:460-478`.
13. **What is "stale" on History?** Status `outstanding` with `date_expired` in the past, re-evaluated each minute by a ticker (rows are memoized, so the clock lives in a cell component). `Contracts.tsx:117-152`.
14. **Why does the market-value row exist only for outstanding contracts in the character modal?** History is not a decision a figure could inform (#717). `ContractDetailModal.tsx` effect at "Only for an outstanding contract".

## Observed gaps (facts from code)

- No corporation contracts view: no `getCorporationContracts` in `esi/registry.ts`; Corp section is Members/Wallet/Assets only.
- Item search and Courier are unavailable in a build without sync backend (explicit empty state).
- Public snapshot is ≤ 30 min old and can list a contract already gone; only discovered on modal open (404 → "no longer listed").
- Courier endpoints that are player structures show only an id: local snapshots hold NPC stations only; wormhole hauls always unplaced.
- Courier region filter cannot match unplaced ends; Space chip row hides bands with no data (Wormhole never offered).
- History rows are not clickable as a whole; only the Type button opens detail (and in dense Search cards the whole row does).
- History modal item lists exist only for item_exchange/auction; courier/loan show no contents.
- Jump counts on Courier use local graph under Travel rules, not live ESI; "—" for unplaced ends or unreachable.
- No saved searches or price alerts on contract searches; no notifications for new matching offers.
- Items tab has no ISK/unit column; price is per contract line stack, not per unit (a multi-type contract's price is unknowable).
- Help/FAQ do not describe Contracts at all (only the stored-data list).
- BPC Sourcing (Industry tab) reads the same snapshot with BPC-only filters, and `/bpc-contracts` appears in ARCHITECTURE as a route; documented in Industry, not here.

## Improvement ideas

- Per-unit price column and sort on Items for stacks.
- Saved search / alert when a matching offer appears under a price (reuses Quickbar price alerts).
- Corporation contracts under `/corp`.
- Make the whole History row open the modal (keep button for a11y).
- Show structure names for courier destinations the Character can resolve (cache-only lookups).
- Surface the going-rate figure itself (median ISK/m³/jump) in the Courier header.
- Explain "Median" over priced offers only.
- Add Contracts/Courier/wallet entries to Help/FAQ.

## Cross-page hooks and shared surfaces

- **Item Detail (Show info)** opened from every item line in the three modals (`ItemInfoLink`): full spec in `docs/features/assets.md` section "Item Detail (Show info) as reached from Assets" and host mechanics in `docs/features/entities-share.md`. Contract lines never show a price in Item Detail from the contract; it shows the Order Book at the saved hub/region.
- **Wallet journal** deep-links here: a journal line with `context_id_type === contract_id` shows "Contract" to `/contracts/history?highlight=<id>` (`features/character/JournalDescriptionCell.tsx`); the History table pulses that row (`highlightRowKey`, `Contracts.tsx` History `DataTable`). The same line can link to the Moon Mining Tax row it settled (`docs/features/wallet.md`).
- **Market**: `docs/features/market.md` section 6 covers Contract search from the Market side; this file is the Contracts-page spec. BPC Sourcing (Industry) reads the same Public Contract Offers snapshot narrowed to blueprint copies (`docs/features/industry-records-sourcing.md`).
- **Notifications**: `contractAccepted` and `courierDeliveryDue` (default both channels), `contractCompleted` and `contractFailed` (feed only), all need `esi-contracts.read_character_contracts.v1` (`features/notifications/events.ts:165-190`); `contractAccepted` alerts deep-link to `/contracts/history?highlight=<id>`. Courier Delivery Due fires when the accepted courier's deliver-by (`courierDeliveryDeadlineMs`) is within the lead time (default 6 h, `courierDeliveryDueLeadHours`), never off `date_expired`.
- **Calendar/Overview** read the same contract list for deadlines (`engine/courierDeadline.ts` shared with the History table; decision `20260925-203743-overview-contracts-row-feeds-next-deadline`).
