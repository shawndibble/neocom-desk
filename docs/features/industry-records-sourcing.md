# Industry shell, Records, BPC Sourcing, Opportunities (feature inventory)

Scope: `src/routes/Industry.tsx` shell + header, Active Jobs, Records tab, BPC Sourcing tab, Opportunities tab (+ All owned, Market-Wide), Blueprint Acquisition link-up. Build Plans tab, plan page, group page, materials, Auto Build, Fit Import, facility defaults, `computeBuildPlan` are covered elsewhere.

Terms per `CONTEXT.md`: **Production Log**, **Production Run**, **BPC Sourcing** (tab label in UI: "BPC Sourcing", i18n `industry.bpcSearchTab`; code comments still say "BPC Search"), **Offer**, **Public Contract Offers snapshot**, **Build Opportunities**, **Market-Wide Build Opportunities**, **Liquidity Floor**, **Order Depth**, **Seeded Build Plan**, **Blueprint Acquisition**.

Where brief items actually live (code differs from the obvious guess):

- Records tab renders only `ProductionLogPanel`. Nothing else.
- Active Jobs panel (personal + corp jobs, jobs CSV, Log production) is in `IndustryHeader`: shows above every tab and on plan/group pages.
- Owned blueprints panel + `ownedBlueprints` CSV = Opportunities tab "All owned" view (`opps.view=owned`).
- Corp blueprints = toggle inside All owned. Corp stock (`corpOwnedStock.ts`) and corp blueprints (`corpOwnedBlueprints.ts`) as plan sources = Build Plan "Corp Assets" toggle (other doc).
- No jobs history anywhere: jobs are fetched `include_completed=false` (`src/features/industry/jobs.ts:32-40`, `src/esi/endpoints.ts:1469`).

## 1. Summary table

| Feature                                    | Where                                                                                                                 | Notes                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Industry shell, 4-tab strip                | `/industry/{plans,records,sourcing,opportunities}` `src/routes/Industry.tsx`, `IndustryHeader.tsx`, `industryTabs.ts` | Tab = path segment (ADR 0015). Header + Active Jobs shared with plan/group pages                              |
| Per-tab settings gear                      | `IndustryHeader.tsx` `tabSettings`                                                                                    | plans: IndustrySettingsForm; opportunities: assumed-ME only; sourcing: BpcSourcingSettingsForm; records: none |
| Blueprints reauth banner                   | `IndustryHeader.tsx`                                                                                                  | GrantBanner for `getCharacterBlueprints`; all tabs                                                            |
| Deep links `?product=` `?material=` + seed | `Industry.tsx`, `planSeed.ts`                                                                                         | Opens/creates plan, redirects to plan page                                                                    |
| Active Jobs panel                          | header, all tabs `ActiveJobsPanel.tsx`                                                                                | Personal + corp jobs, filters, CSV, slot readout, Log production                                              |
| Log production from job                    | job row button, `LogProductionFromJobDialog.tsx`, `logProductionFromJob.ts`                                           | Finished mfg/reaction personal jobs only; 0/1/many plan resolve                                               |
| Production Log (Records)                   | `/industry/records` `ProductionLogPanel.tsx`                                                                          | Totals, profit chart, By item table, folded All runs table, date range, 2 CSVs                                |
| Sold split button + modals                 | Records runs table `SaleLinkingControls.tsx`, `useSaleLinking.ts`                                                     | Link Past Sale, Watch Open Order, Manual Sale, Delete run                                                     |
| Realized profit breakdown                  | `RealizedProfitCell` / `RealizedProfitBreakdown.tsx`                                                                  | Modal per run                                                                                                 |
| BPC Sourcing search                        | `/industry/sourcing` `BpcSourcingPanel.tsx`                                                                           | 5 sources, filters, autocomplete, strip, 200-row table, CSV                                                   |
| BPC contract detail modal                  | `BpcContractModal.tsx` -> `PublicContractDetailModal`                                                                 | Row click on contract rows                                                                                    |
| BPO badge/cards                            | `BpoBadge.tsx`, `BpoCard.tsx`, `bpoAvailability.ts`                                                                   | Contract + market originals                                                                                   |
| Build Opportunities (Ranked)               | `/industry/opportunities` `OpportunitiesPanel.tsx`                                                                    | Owned blueprints ranked by ISK/hour, compare seeding, CSV                                                     |
| All owned view                             | `OwnedBlueprintsPanel.tsx`                                                                                            | Library of owned BPO/BPC (+corp), column picker, CSV                                                          |
| Market-Wide Build Opportunities            | `MarketWideOpportunitiesPanel.tsx`                                                                                    | Opt-in scan, filters, paging by 200, CSV                                                                      |
| Phone card lists                           | `MobileOpportunityList`, `MobileOwnedBlueprintList`, `MobileMarketWideList`, `MobileSortToolbar`                      | Cards, sort menu, identical-copy folding                                                                      |
| Blueprint Acquisition modal                | mounted by `BuildPlanDetail.tsx`; logic in `BlueprintAcquisitionModal.tsx`                                            | Link-up only; shared row builders with BPC Sourcing                                                           |

## 2. Industry shell (`src/routes/Industry.tsx`)

- Route `/industry/*`; `INDUSTRY_TABS` = plans (default), records, sourcing, opportunities. Labels: Build Plans, Records, BPC Sourcing, Opportunities (`en.json` `industry.buildPlansTab` etc.). `usePageTab` reads path segment; switch = history push; unknown segment -> `TabRoute` replaces with default. `/bpc-contracts` redirects to `/industry/sourcing` (`src/app/App.tsx:201`). Nav: one entry `/industry`, `mobileTab: true`, `gating: 'scope'` (`src/app/navDestinations.ts`); tabs come from `PAGE_TABS` (`src/app/pageTabs.ts`).
- Route is `UNGATED` in `src/app/routeScopes.ts` (comment: multi-scope page, panel-level gating). Plan/group routes the same.
- Workspace not `hydrated` -> full spinner; then no active Character -> redirect to `/characters`; header renders, and a second inline spinner shows under it until `plans`, `catalog`, build groups, expanded groups load.
- Header (`IndustryHeader.tsx`): `PageHeader` title "Industry" + `meta` (Opportunities tab only: `DataAgeBadge` = oldest blueprint fetch reported by `OpportunitiesPanel` via `onDataAgeChange`), tab settings gear, `ActiveJobsPanel`, blueprints reauth `GrantBanner`, `Tabs` (`activation` automatic on index, manual on plan/group pages where pick navigates away).
- Settings gear per tab: see summary. Records has no settings. Modal is `PageSettingsButton`, `section="industry"`.
- Deep links handled in an effect once plans+catalog load: `?product=<typeId>` finds existing plan for blueprint (matching `planSeed` ME/TE/runs, or an LP blueprint-price pick) else creates one (`createPlan`), then `navigate('/industry/plans/:id', replace)`; unresolvable -> param removed. LP-seeded existing plan: stale `overridePrice` patched before opening. `?material=<typeId>` jumps to the plan building that material (`buildPlansByMaterialTypeID`). Seeds: `parsePlanSeed` (BPC Offer ME/TE/runs, `planSeed.ts`), `parseBlueprintPriceSeed` (LP Store "Plan in Industry").
- `location.state.fitImportText` (Fitting export "Manufacture Plan") opens Fit Import dialog (other doc).
- Plans tab URL: `plans.compare` bool (compare mode).
- `handleStartPlan(entry)`: used by Opportunities rows/Market-Wide rows/All owned; guarded by `startingPlanRef` against double tap; creates plan (`createPlan`, facility defaults read off disk) and navigates to plan page.
- `handleAddOpportunitiesToCompare(rows)`: creates a plan per ranked row (`planForOpportunityCandidate`, row's sourcing, build-here, hub), selects them, switches to Plans tab in compare mode.
- `openRunFromRecords(planId)`: expands the plan's group then navigates to plan page.
- Market-wide trees (`loadMarketWideTrees`, `public/data/marketWideTrees.json`) loaded once in the shell; passed to Market-Wide panel only.
- Opportunities tab: Market-Wide panel first (hub fixed `DEFAULT_TRADE_HUB`), then Ranked panel; Ranked waits for `pricingInputs.hydrated` (issue #2054, Spinner) so it never prices at default assumed ME.
- Keyboard: only the global `go-to-industry` shortcut (`src/lib/shortcuts.ts`). No tab-specific shortcuts in these files. Combobox arrow keys in BPC Sourcing search (see 5).
- Data: `useIndustryWorkspace.ts` (catalog, owned blueprints, pricing inputs, facility defaults, modifiers, groups, owned-stock snapshot incl. corp stock state); `workspaceLoadCache.ts` keeps last load across the three Industry pages.

## 3. Active Jobs panel (`ActiveJobsPanel.tsx`, `jobs.ts`, `corpJobs.ts`, `jobsCsv.ts`)

What: "Active jobs" panel above the tabs; running industry jobs of all activities (manufacturing 1, research TE/ME, copying, invention, reactions 11), soonest end first.

Data / scopes:

- Personal: ESI `getCharacterIndustryJobs`, scope `esi-industry.read_character_jobs.v1`, `include_completed=false`, cached key `industryJobs`, conditional fetch. 403 -> `needsReauth` (no cache fallback).
- Corp (issue #2302): `loadAccountCorpIndustryJobs` -> `getCorporationIndustryJobs` via any account Character with scope `esi-industry.read_corporation_jobs.v1` (opt-in) and role `canReadIndustry` (`corpCapabilities`); one read per corporation (`pickCorpReaders`, active Character preferred); scope checked from stored token first so no app-wide reauth banner. Listed by `installer_id` for selected account Characters; job an alert named is kept even if not installed by one (`visibleCorpJobs`). Never rejects.
- Skills for slot readout: `loadCorrectedSkills(skipQueueWithoutScope)`.
- Multi-Character: `loadAllCharactersIndustryJobs` fan-out (`ESI_FANOUT_CONCURRENCY`), characters without scope listed in `skipped` note.

Controls and states:

- Panel header: Character filter (`CharacterFilterControl`, hidden for single-Character accounts; URL `jobs.chars`, default from Settings `useDefaultCharacterFilter`), one-line summary "N running, N done" + next finish ("name in 2h"), job slot readout (`HintText`: open slots mfg / science / reactions, colour danger when all open, warning when >=50% open; tooltip used/max per category), caret to fold list.
- List folded by default; auto-expands when a notification deep link `?highlight=<job_id>` (`useHighlightParam`; alerts `industryJobComplete`/`corpIndustryJobReady`) points at a job. Row pulses via `highlightRowKey`.
- "Done" = `end_date` passed (`isJobDone`), not ESI `status`; "Completing soon" = 0 < remaining <= 1h (`jobs.ts:171-178`). Log production enabled for activities 1 and 11 only (`jobs.ts:187`).
- Filters (shown only when meaningful): Activity multiselect (present activities + still-selected), Status multiselect (Completing soon = ends within 1h; Done). URL `jobs.activity` (id list), `jobs.status`. Empty set = no filter.
- Table columns: Blueprint (ItemInfoLink, badges: Completing soon / Done / Corp / Character link when >1 Character), Activity, Runs, Progress (bar), Ends in, Ends (EVE time), trailing action. Default sort `endsIn` asc; URL `jobs.sort`. Row tint + left stripe warning/success. Compact density, `mobileSort`, stacked on phone.
- Row action "Log production" button (finished mfg/reaction personal jobs with `product_type_id`; corp rows never) -> `findMatchingBuildPlans(characterId, job)` -> 1 match: switch active Character to job owner if needed then navigate `/industry/plans/:id` with `location.state.logProductionFromJob` ({runs, jobFee=cost}); 0 or many: `LogProductionFromJobDialog`.
- `LogProductionFromJobDialog`: 0 plans -> "create a Build Plan for this blueprint" (`createBuildPlanForJob`, defaults via `newBuildPlan`; fails with alert text when blueprint not in catalog); many -> pick list of plan names; Cancel.
- Export/Refresh in table toolbar: CSV surface `industry-jobs` (Activity, Blueprint, Blueprint type id, Runs, Start, End, Cost ISK, Status; filtered rows in table order), refresh icon (disabled while loading), `DataAgeBadge` (oldest of personal+corp). Offline/refresh-failed banner `common.offlineTitle`/`refreshFailedTitle`.
- Empty states: answered + none -> one-line "no active jobs" meta, body hidden; never fetched -> `jobsEmptyTitle` (hint: refresh online); reauth -> `GrantBanner` (single) or per-character ghost banners (multi); filtered empty -> Reset filters button.
- Countdown tick 30 s (`useTicker`, paused when tab hidden). Result snapshot cached via `useRouteSnapshot` key `industry:active-jobs`.

Observed gaps:

- No completed-job history: delivered jobs drop off; Records' own caveat says unlogged completed jobs are not counted (`industry.productionLogCaveat`).
- Log production is personal jobs only (comment cites decision `20260905-181537-production-log-row-per-allocation-sync-accept-wallet`); corp job rows have no action.
- Header ghost-reauth for corp scope is intentionally absent (decision `20260929-184545-no-note-for-corp-jobs-nobody-here-can`).
- No row context menu or row click on a job; ItemInfoLink only.
- UX-REVIEW §2 noted empty state with no reconnect action; code now renders `GrantBanner` with an action (historical).

## 4. Records tab: Production Log (`/industry/records`, `ProductionLogPanel.tsx`)

What: account-wide (active Character) realized-profit rollup of every logged **Production Run**, grouped by product. Distinct from the per-plan `ProductionRunsPanel` on plan page (same sale-linking hook/columns, other doc).

Data: Dexie `productionRuns`, `productionSaleLinks`, `productionOrderWatches` (live queries by `characterId`; synced via `markProductionRunDeleted` / `scheduleSync`). Plans (to know if a run's plan exists), catalog (names), skills (`modifiers.skills`: Accounting, Broker Relations), Trade Hub standing (`useTradeHubStandings`) per run's plan hub.

Layout:

- Left: hero "Total realized profit" (tone-coloured ISK) + subtitle + caveat ("N logged runs across N items; unlogged completed jobs not counted"), `AssumesBaseStandingsNote` when any run paid broker fee, ledger rows: Total cost logged, Total revenue linked, Open inventory value, Avg margin (unknown until a sale linked).
- Right: profit-over-time chart (lazy Recharts `ProductionProfitChart`, only when >=2 daily points; cumulative realized profit by local day, line coloured by trend up/down/flat, tooltip, `role=img` label), "By item" table, folded "All production runs" panel.
- Date range: `FilterBar` with From/To date inputs (`records.from`, `records.to`, ISO dates; mobile = filter sheet). Filters runs by logged date (`productionLogFilter.ts`).
- By item columns: Product (ItemInfoLink), Runs logged, Units produced, Units sold, Realized profit, Avg margin, Sold-units margin, Unsold cost. Sort URL `records.itemSort`. CSV `production-log-items` via `TableActionsMenu`.
- All runs (collapsed by default; `CollapsiblePanel` show/hide + count): Logged, Item, Quantity, Total cost, Sold, Realized profit (button opens `RealizedProfitBreakdown` modal: rule + substituted values; sales tax from Accounting, broker fee from Broker Relations + standing), Status chip (new/open/closed), Sold actions. Sort URL `records.runSort`. CSV `production-log-runs` (falls back to rollup order while folded). Row click -> run's plan page only when plan still exists (`planExists`; row link cue accent); else inert + ItemInfoLink.
- Sold split button (`SoldSplitButton`): primary "Sold..." = Link Past Sale (picker of wallet sell transactions of that product not yet linked, `getCharacterWalletTransactions`, wallet scope), dropdown: Watch Open Order (picker of open non-buy orders of that product, `loadOrders`, `esi-markets.read_character_orders.v1`), Manual Sale (modal: quantity, unit price with validation), Delete production run (confirm modal; the only delete on Records), plus refresh icon when a run has unclosed order watches (re-reads orders, updates `lastKnownVolumeRemain`, closes watches whose order vanished).
- Empty: no runs at all -> `productionLogEmptyTitle` (hint: log a run from a plan's Results panel); date filter excludes all -> filtered empty state.
- Mobile: tables stack (`DataTable` `mobileSort`, compact); filter in sheet; no separate card list.

Engine: `summarizeProductionRun` (`productionRunSummary.ts`): sold qty = linked sales + watched-order filled units; `realizedProfit` (`src/engine/industry/realizedProfit.ts`) nets sales tax and broker fee (only on watched-order revenue); status new/open/closed; open inventory = remaining x cost per unit. Item rollup margin is revenue-weighted, not averaged; `soldUnitsMargin` = net revenue less sold units' share of cost.

Observed gaps:

- No Records content beyond Production Log; completed jobs not logged are invisible here.
- Run rows are inert once their plan is deleted (by design: runs are locked records).
- Date range filters only by logged date; no item/plan filter or search.
- Sale linking only offers wallet sell transactions / open sell orders of the active Character; no corp wallet.
- Deleting a Character deletes its production log rows (decision `20260926-212411-removing-a-character-deletes-its-production-log-rows`).
- No per-tab settings gear on Records (others have one).

## 5. BPC Sourcing tab (`/industry/sourcing`, `src/features/bpcContracts`)

What: search over every public contract Blueprint Copy for sale in New Eden plus (optional) contract BPOs, market BPO sell orders, LP Store copies, and the pilot's owned blueprints. ADR 0013 (Firestore shared snapshot fed by scheduled EVE Ref crawl), ADR 0015 (URL state).

Data source:

- Public Contract Offers snapshot: Firestore `publicContractOffers` written by `syncPublicContractOffers` (every 30 min, admin write only, signed-in read; ADR 0013 amendments 2026-09-12). Read via `loadPublicBpcContracts` (`syncedContracts.ts`), narrowed to copies in browser (`engine/contracts/contractOffers.ts`), originals kept separately for BPO source. Cached through `esi/cache.ts` `GLOBAL_CACHE_CHARACTER_ID`; stale window = publish interval (30 min); panel Refresh bypasses. Needs Firebase sync configured (`isSyncConfigured`), not an ESI scope. UI shows snapshot `lastSyncedAt` as `DataAgeBadge`.
- Owned: `loadCharacterBlueprints` (scope `esi-characters.read_blueprints.v1`; 401/403 resolves empty here, header banner covers reauth).
- Market BPOs: `useMarketBpoOrders` -> `loadOrderBookView` per type (ESI market orders, region mode, Global Market Region aware), lazy, short debounce, concurrency-capped; only for the picked blueprint or closest typed matches (`MARKET_BPO_LOOKUP_LIMIT = 10`, `useMarketBpoOrders.ts:32`).
- LP: `useLpBlueprintOffers` -> `findLpOfferMatches` over corps the pilot's Characters hold LP with (scope `esi-characters.read_loyalty.v1`), priced ISK + LP x LP Value (pilot's own or store market) + turn-ins at hub; offers whose LP nothing prices are omitted.
- Locations: SDE-only `loadContractLocationInfo` for contract rows (no ESI per row; player structures unnamed), `loadBlueprintLocation` for owned rows (resolves with Character ACL).
- Contract detail items: `publicContractItems.ts` read live on modal open (public ESI route, cached globally).

Search/filter controls (`BpcFilterBar`, FilterBar: inline from `md`, sheet below; active chips row on phone with Clear all):

- Search box = ARIA combobox autocomplete (`SUGGESTION_LIMIT = 8`, `BpcSourcingPanel.tsx:257`): arrow keys move highlight, Enter picks, Escape hides, ArrowDown reopens. Rows show offer counts and best ME/TE. Typing = free-text match on name (minus "Blueprint", decision `20260908-203708`); picking = pins one blueprint (`sourcing.type`), unlocking per-blueprint summary strip. Editing text drops the pin. `bpcSourcingHref(typeId)` builds "search BPC Sourcing for this" links.
- Region (`sourcing.region`, RegionSelect), Jump Range (`sourcing.jumps`, from Current System via `CurrentSystemPicker`; unplaceable rows drop; note when no origin), Min ME / Min TE / Min runs / Max price (`sourcing.minMe|minTe|minRuns|maxPrice`, text parsed to ints, blank/invalid ignored), Exclude: Auctions (`sourcing.hideAuctions`), PLEX contracts (`sourcing.hidePlex`) with defaults from Settings (`sync.bpcHideAuctions`, `sync.bpcHidePlex`; URL wins, nothing writes back), Source multiselect (`sourcing.src`: contract, contractBpo, market, lp, owned; default contract+owned; remembered per device `bpcSourcingSources`; link wins), Space multiselect (high/low/null/wormhole; device-local `bpcSearchSpaceFilter`; empty rejected).
- Reset filters (empty-state action), ColumnPicker (`bpcSearchVisibleColumns.v2`; default Location, Jumps, ME, TE, Price; optional Source, Runs, Qty, ISK/run, Region, Space, Expires; Item always).
- Suggestion counts use the same non-type filter as the table so counts agree.

Results:

- Strip above table when one blueprint picked: stat chips (Cheapest, Cheapest per run, Median, Best ME/TE), "Cheapest by region" cells (max 6, `REGION_CELL_LIMIT`; scrolls sideways on phone), Market BPOs / Contract BPOs cards (`BpoCard`, cheapest card gets accent; "may be cheaper than copy" check `bpoMayBeCheaper`), market scope note (hub vs region, checking, failed N, capped 10).
- With several blueprints, one copy per type gets a "BPO too" `BpoBadge` (tooltip: price, location, region; tap only explains).
- Table: `DataTable` stackLayout dense (two-line cards on phone, sort picker `mobileSort`), virtualized, default sort Price asc (`sourcing.sort`), cap `RESULT_LIMIT = 200` rows after sort (`BpcSourcingPanel.tsx:267`; note "Showing 200 of N"). Price cell: ISK, PLEX-only/ISK+PLEX, auction buyout/starting bid, LP cost, whole-contract marker for bundles. Owned rows tagged "Owned" in Item cell.
- Row click: contract row -> `BpcContractModal`; market row -> `/market/browser` with item; LP row -> `/market/lp-store/:corp?offer=&affordableOnly=0`; owned row: nothing. Row context menu (`rowMoreActions`): `BuildPlanContextMenu` (start Build Plan seeded with the copy's ME/TE/runs, BPO or unknown runs = unseeded; "view in market" omitted) + `SetWaypointMenuItem` for contract/market/owned rows with a resolvable location id (`waypointItemFor`, `BpcSourcingPanel.tsx:332`); LP rows get none. Menu applies to all rows incl. LP.
- `BpcContractModal` -> shared `PublicContractDetailModal`: header chips Price (with PLEX/auction wording), ME/TE, Runs, Qty; location, expiry, contract id, contents list (lines can seed a plan, decision `20260909-111752`); contract may already be gone (ordinary state).
- CSV `bpc-sourcing`: Item + visible columns in table order, raw numbers, whole match set (not just 200) via `source: 'sorted-rows'`.
- States: spinner; load error (`loadFailedTitle`); sync not configured (`notConfiguredTitle`); nothing to search anywhere (`emptyTitle`); no source ticked (`noSourceSelected`); filters exclude all (`noFilterMatches` + Reset); offline banner from cache; Refresh icon also bumps market lookup.

Key pure calcs (`src/engine/contracts/bpcSearch.ts`): `effectivePrice` (auction = buyout), `iskPerRun`, `cheapestByRegion`, `bpcPriceSummary` (cheapest/median/best ME-TE), `filterBpcSearchRows`, `blueprintOfferStats`. BPO cheapest from `blueprintAcquisitionSources` builders (skip multi-type bundles and zero-price barters).

Observed gaps:

- Table capped at 200 rows; broader searches must be narrowed (decision `20261003-112230-bpc-sourcing-caps-its-table-at-200-rows`).
- Market BPO lookup limited to picked blueprint or 10 closest matches; failed book reported, not read as "no BPO".
- Owned rows have no click action; a blueprint in a container/ship has no location name and no waypoint.
- Market region falls back to the pilot's market hub when Region = All.
- Owned source uses active Character only (no all-Character or corp scope, unlike Opportunities All owned).
- Space/Jump filters apply to contract rows up front; rows whose location cannot be placed drop out when a Jump Range is set.
- Tab panel has no title of its own (tab label stands in); table label from `bpcContracts.title`.

## 6. Opportunities tab (`/industry/opportunities`)

Two panels, Market-Wide first.

### 6a. Ranked (Build Opportunities), `OpportunitiesPanel.tsx`

- What: every manufacturing blueprint (BPO or BPC) the selected Characters own, priced and ranked by ISK/hour. Reactions and SDE-unknown blueprints excluded from ranking (`buildOpportunityCandidates`). No auto-build depth (removed, issue #652).
- Data: `loadCharacterBlueprints` per selected Character (ESI blueprints scope); oldest fetch -> header `DataAgeBadge`. Market via `loadMarketSnapshot(s)` batched per distinct Trade Hub (Fuzzwork hub prices, ESI adjusted prices + system cost index, ADR 0002); hub per owning Character = hub of that Character's most recently updated plan else default (`hubForCharacter`). Per-Character skills/implants (`useCharacterModifiersByCharacter`, effective levels) and Trade Hub standings. Owned stock snapshot reduces material cost (owned materials claimed). Skill-gate verdict from account skills (`useAccountSkillLevels`, raw active level).
- Controls: view toggle Ranked / All owned (`opps.view`; desktop segmented, phone select that doubles as title), Character filter (`opps.chars`, default current, hidden for one Character), progress counter "done/total" while pricing, Refresh button when manual-only, "Add N to Compare" (desktop, when >=2 ticked) -> seeds plans and opens Plans tab compare, CSV `industry-opportunities` (Product, Character, Blueprint, Runs, Unit margin, Margin %, Time s, ISK/hour, Order depth; `opportunitiesCsv.ts`).
- Columns: select checkbox, Product (+skill-gate marker, Character name when >1), Blueprint (BPO/BPC chip with runs, unlimited for BPO), Unit margin, Margin %, Time, ISK/hour, Order depth (+loss InfoTooltip when profit < 0), Start plan button. Default sort `iskPerHour` desc, URL `opps.sort`. Virtualized (`virtualize auto`). Row click = Start plan (`useRowStartPlan`, one plan per key).
- Phone: `MobileOpportunityList`: sort toolbar (ISK/hr, Unit margin, Margin, Time; same `opps.sort`), cards with checkbox, hero figure of active sort field, copies folded by `identicalBlueprintKey` (owner, type, location, ME, TE, runs) with "N copies", card tap = Start plan, per-card menu "Price history" (opens `PriceHistoryPanel` modal for product at row's hub region), sticky compare bar (selected count, Clear, Compare).
- States: loading spinner; no candidates (`opportunitiesEmptyTitle`); needs refresh (cached large batch priced at changed inputs, issue #2056: no rows until Refresh).
- Engine: `computeOpportunityRow` prices candidate via `buildVsBuy`/`computeBuildPlan`; top-level blueprint owned so no acquisition gap priced; ISK/hour = profit / (seconds/3600) (`buildVsBuy.ts`); `rankOpportunityRows` sorts, unpriceable last; `classifyOrderDepth` = hub sell-order ISK / build cost: deep >= 3, thin < 0.5, else moderate, unknown if no hub sell price; unit margin = profit / (product qty x priced runs; BPO priced at 1 run). Incremental: shared batched snapshot fetch then chunked pricing with `setTimeout(0)` yields; progress frames re-ranked at most every 500 ms (`throttledRanking.ts`, `useOpportunities.ts:63`). Module-level `rowsCache` survives tab switches; above 10 candidates a remount never recomputes (`AUTO_RECALCULATE_MAX = 10`, `opportunities.ts:439`), and `opportunitiesInputsKey` drops stale cache (assumed ME, owned ME/TE).

### 6b. All owned view, `OwnedBlueprintsPanel.tsx` (`opps.view=owned`)

- What: every blueprint of selected Characters (and optionally their corp) as a library; nothing dropped (reactions, unknown, unpriceable). ISK/hour borrowed from ranked rows when available.
- Data: same blueprint loads as Ranked; corp blueprints `useCorpOwnedBlueprints` -> `loadCorporationBlueprints` (scope `esi-corporations.read_blueprints.v1`, role `canReadBlueprints`); toggle shown only when available. Placement: container walk-up through owner's cached assets (`resolveBlueprintPlacement`, assets scope); location names `loadBlueprintLocation` per (Character, location) lazily; corp blueprints in containers show "In container".
- Controls: search (`opps.q`), Kind (All/BPO/BPC `opps.kind`, inline above cards on phone), Activity (All/Manufacturing/Reaction `opps.activity`), Include corporation chip (`opps.corp`), FilterBar (count badge; kind not counted on phone), column picker (desktop, device-local `ownedBlueprintsVisibleColumns`: kind, ME, TE, runs, qty, location, owner, ISK/hour), CSV `industry-owned-blueprints` (Blueprint, Product, Activity, Kind, ME, TE, Runs, Quantity, Location, Owner, ISK/hour).
- Table: sort `opps.ownedSort` default blueprint asc; owner column appears only when >1 owner; row click / Start plan button when catalog entry exists (blueprint with no catalog entry is inert); BPO runs show unlimited and sort as max; quantity = stack size for originals.
- `MobileOwnedBlueprintList`: cards, sort toolbar, identical copies folded, card tap = Start plan; no selection or menu.
- States: loading; no blueprints (`ownedBlueprintsEmptyTitle`); no match for filters.

### 6c. Market-Wide Build Opportunities, `MarketWideOpportunitiesPanel.tsx`

- What: opt-in "Run market scan" (never auto) ranking manufacturable products across whole SDE whose blueprint is obtainable. Cold-start answer.
- Data: precomputed flattened trees `public/data/marketWideTrees.json` (ME-0 approximation, `scripts/build-sde.mjs`); two-phase pricing: (1) product sell prices for all candidates, `selectLiquidCandidates` = **Liquidity Floor** `DEFAULT_LIQUIDITY_FLOOR_ISK = 50,000,000` sell-order ISK at hub plus top N = 5 per Market Group (`marketWideOpportunities.ts:51,54`); (2) material prices for survivors, `computeMarketWideRows`. Troll sell orders priced at CCP average (`priceCapped` InfoTooltip). Job fee assumes NPC station at hub's own system index (no owned facility). Hub fixed `DEFAULT_TRADE_HUB`, no picker.
- Blueprint sources (`blueprintSourceSets.ts`, each best-effort, failures listed in "sources unavailable" note): owned (any account Character), market (NPC-seeded T1 originals), contract (Public Contract Offers snapshot via any Character's Firebase session), lpStore (corps any Character holds LP with). Preference order owned, market, contract, lpStore (`BLUEPRINT_SOURCES`).
- Filters (FilterBar funnel beside Scan; URL `marketWide.*`): Max build cost (Any/10M/100M/1B/10B, `marketWide.maxCost`, applied after ranking), Tier (tech1/tech2/tech3/faction/special `marketWide.tiers`), Category (`marketWide.categories`), Blueprint source (`marketWide.sources`), Hide skill-gated (`marketWide.hideGated`, count chip), Hide rarely sold (< 5/day, `RARELY_SOLD_PER_DAY`, `marketWideSanity.ts:37`; `marketWide.hideRare`; sales = 30-day average summed over 5 trade-hub regions via `useDailySales`, "checking N" note; unreadable stays visible). Tier/category/source changes re-scan (applied before top-N), others narrow existing rows.
- Table: Product (+skill-gate marker), Blueprint source, Margin, Time (whole-tree TE-0 time), ISK/hour (price-capped tooltip), Build cost, Order depth, Start plan. Default sort `iskPerHour` desc (`marketWide.sort`). Shows first 200 (`MARKET_WIDE_PAGE_SIZE`, `marketWidePage.ts:7`) under the active sort; "Show next 200" button; "Showing X of Y". Row click = Start plan when product has a catalog entry. CSV `market-wide-opportunities` (Product, Blueprint source, Margin %, Time s, ISK/hour, Build cost, Order depth; visible rows only, not just the shown page). Info tooltip in header explains liquidity/obtainability rule.
- Phone: `MobileMarketWideList` cards with rank badge, sort toolbar, Start plan icon button; no selection/compare; card tap = Start plan.
- Skill gate: `SkillGateMarker` names the missing skill; popover (closest Character, skills to train, Add to Skill Plan); rule note under table.
- States: before scan `marketOpportunitiesEmptyTitle`; a failed scan sets `error` in `useMarketWideOpportunities.ts:119` but the panel never reads it: reads as no-results (`marketOpportunitiesNoResultsTitle`); scanning spinner (Scan button disabled/"Scanning..."); no results + unavailable sources note; Assumes base standings note.

Observed gaps (Opportunities):

- Price history reachable only from the phone card menu; desktop Ranked table has no row menu or history action (`PriceHistoryPanel` modal opens only via `onViewHistory`: `OpportunitiesPanel.tsx:636` -> modal `:644-655`, fired from the card menu at `MobileOpportunityList.tsx:324`; desktop `DataTable` at `OpportunitiesPanel.tsx:616` is chosen by `isDesktop` and only has `onRowClick` = Start plan).
- No `rowContextMenu` or `rowMoreActions` on Ranked (`:616`), All owned (`OwnedBlueprintsPanel.tsx:493`) or Market-Wide (`MarketWideOpportunitiesPanel.tsx:570`) tables (grep: none in the three panels).
- Market-Wide has no compare/select and no hub picker; ME-0 trees and NPC-station fees are approximations (CONTEXT: "selecting a row still opens a real Build Plan for exact numbers").
- Ranked recompute is manual above 10 blueprints; assets-only changes do not invalidate cache (by design).
- Ranked rows never price a blueprint acquisition gap (all owned by construction).
- All owned: corp blueprints in containers show only "In container"; no corp assets cache for placement.
- Header `DataAgeBadge` reports Ranked's blueprint fetch only; Market-Wide has no data-age indicator.

## 7. Blueprint Acquisition modal (link-up, `BlueprintAcquisitionModal.tsx`)

Mounted by `BuildPlanDetail.tsx` (plan page, other doc); documented here because BPC Sourcing shares its row builders (`blueprintAcquisitionSources.ts`: `contractOfferRows`, `marketSellRows`, `lpOfferRows`, `ownedTierRows`, `cheapestRow`, `groupContractOffers`, `sectionRows` cap 10) and its pricing offers (`blueprintPurchaseOffers.ts`, `blueprintSourceSets.ts`).

- Opens from an icon on any Blueprint Acquisition row (top-level or sub-build). Sections: Owned tiers (per tier, "use automatic"), Public Contracts (copies + originals, hub region or all regions, bundles/barters unpickable and hidden unless nothing else), Market sell orders (whole region, hub picker affects only the modal), LP Store offers (ISK + LP at LP Value + turn-ins), Manual entry (ME, TE, price with validation). Each row "Use this blueprint"; cheapest tagged; "Showing 10 of N".
- A pick writes `MaterialSourcing.acquisitionTierOverride` (+ `overridePrice` for non-owned) keyed by blueprint typeID via `overridePatchFor`; `runsForPickedRow` sets plan runs to what the pick brings (LP: none). `isCurrentPick` marks the selected row. Override price = one purchase of the row (a short copy listing is underpriced vs automatic `shortfallCost`; modal shows runs and ISK/run to judge).
- Data self-fetched on open: snapshot (`loadPublicBpcContracts`), `loadOrderBookView`, `findLpOfferMatches`; station names SDE-only. Loading/unavailable/empty per section.
- `blueprintPurchaseOffers.ts`: automatic tier selection also reads cheapest market sell order in the blueprint's region and every LP redemption any account Character could make (turn-ins priced at hub sell for what pilot does not hold, `loadLpTurnInPricer`); best-effort; `lpBlueprintPickPrice` seeds LP Store "Plan in Industry".
- Engine: `src/engine/industry/blueprintAcquisition.ts`, `blueprintObtainability.ts`.

## 8. URL parameters (ADR 0015; defaults omitted, writes replace history)

| Key                                                                                           | Panel             | Notes                                      |
| --------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------ |
| `jobs.chars`                                                                                  | Active Jobs       | Character filter; default = synced default |
| `jobs.activity`, `jobs.status`                                                                | Active Jobs       | id list / enum set, empty = none           |
| `jobs.sort`                                                                                   | Active Jobs       | default endsIn asc                         |
| `highlight`                                                                                   | Active Jobs       | job id from alert deep link                |
| `records.from`, `records.to`                                                                  | Records           | ISO date                                   |
| `records.itemSort`, `records.runSort`                                                         | Records           | optional sort, unsorted default            |
| `sourcing.q`, `.region`, `.minMe`, `.minTe`, `.minRuns`, `.maxPrice`                          | BPC Sourcing      | text/id                                    |
| `sourcing.hideAuctions`, `.hidePlex`                                                          | BPC Sourcing      | default from Settings                      |
| `sourcing.src`                                                                                | BPC Sourcing      | set; default contract+owned or remembered  |
| `sourcing.jumps`                                                                              | BPC Sourcing      | Jump Range                                 |
| `sourcing.type`                                                                               | BPC Sourcing      | pinned blueprint typeId                    |
| `sourcing.sort`                                                                               | BPC Sourcing      | default price asc                          |
| `opps.view`                                                                                   | Opportunities     | ranked / owned                             |
| `opps.chars`                                                                                  | Opportunities     | default current                            |
| `opps.sort`                                                                                   | Ranked            | default iskPerHour desc                    |
| `opps.kind`, `opps.activity`, `opps.q`, `opps.corp`, `opps.ownedSort`                         | All owned         |                                            |
| `marketWide.tiers`, `.categories`, `.sources`, `.maxCost`, `.hideGated`, `.hideRare`, `.sort` | Market-Wide       |                                            |
| `plans.compare`                                                                               | Plans (other doc) |                                            |
| `product`, `material` + seed keys                                                             | shell             | deep links (`planSeed.ts`)                 |

Device-local settings (not URL): `bpcSearchVisibleColumns.v2`, `bpcSearchSpaceFilter`, `bpcSourcingSources`, `ownedBlueprintsVisibleColumns`. Synced: `sync.bpcHideAuctions`, `sync.bpcHidePlex`, `sync.loyaltyLpValue`.

## 9. CSV export surfaces (`TableActionsMenu` + `useTableExport`)

| Surface id                  | Where            | Rows                       |
| --------------------------- | ---------------- | -------------------------- |
| `industry-jobs`             | Active Jobs      | filtered jobs, table order |
| `production-log-items`      | Records By item  | rollup rows                |
| `production-log-runs`       | Records All runs | filtered runs              |
| `industry-owned-blueprints` | All owned        | filtered rows              |
| `industry-opportunities`    | Ranked           | all ranked rows            |
| `market-wide-opportunities` | Market-Wide      | visible (filtered) rows    |
| `bpc-sourcing`              | BPC Sourcing     | all matches in table order |

## 10. Data sources and scopes

Route `/industry` is UNGATED (`src/app/routeScopes.ts`); every panel gates itself.

| Data                                                    | Source                                   | Scope / gate                                                              |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Personal jobs                                           | ESI `getCharacterIndustryJobs`           | `esi-industry.read_character_jobs.v1` (403 -> reauth)                     |
| Corp jobs                                               | ESI `getCorporationIndustryJobs`         | `esi-industry.read_corporation_jobs.v1` (opt-in) + role `canReadIndustry` |
| Owned blueprints                                        | ESI `getCharacterBlueprints`             | `esi-characters.read_blueprints.v1`                                       |
| Corp blueprints                                         | ESI `getCorporationBlueprints`           | `esi-corporations.read_blueprints.v1` + role `canReadBlueprints`          |
| Owned assets (placement, stock)                         | ESI `getCharacterAssets`                 | `esi-assets.read_assets.v1`                                               |
| Corp assets (plan stock)                                | ESI `getCorporationAssets`               | `esi-assets.read_corporation_assets.v1` + director role                   |
| Wallet transactions (link sale)                         | ESI wallet transactions                  | `esi-wallet.read_character_wallet.v1`                                     |
| Open orders (watch order)                               | ESI character orders                     | `esi-markets.read_character_orders.v1`                                    |
| LP balances                                             | ESI loyalty points                       | `esi-characters.read_loyalty.v1`                                          |
| Skills                                                  | ESI skills (+queue)                      | skills scopes; used for fees, job slots, skill gate                       |
| Hub prices                                              | Fuzzwork (ADR 0002)                      | none                                                                      |
| Adjusted prices, cost indices                           | ESI public                               | none                                                                      |
| Market order books / history                            | ESI public (ADR 0003)                    | none                                                                      |
| Public contract offers                                  | Firestore `publicContractOffers`         | Firebase sync configured + signed-in session                              |
| Blueprints/types/trees/market groups                    | static SDE snapshots                     | none                                                                      |
| Production runs, sale links, order watches, build plans | Dexie, synced to Firestore per Character | none                                                                      |

## 11. Engine calcs (1-2 lines each)

- ISK/hour (`buildVsBuy.ts`): profit / (job seconds / 3600); null when seconds 0.
- `classifyOrderDepth` (`src/engine/industry/opportunities.ts`): sell-order ISK at hub / build cost: >=3 deep, <0.5 thin, else moderate, null price -> unknown.
- `realizedProfit` (`src/engine/industry/realizedProfit.ts`): revenue less material cost, job fee, sales tax (Accounting), broker fee on watched-order revenue (Broker Relations + standing).
- `aggregateJobSlotSummary` (`src/engine/industry/jobSlots.ts`): max slots per category from skills minus running jobs (Active Jobs panel adds corp jobs to their installer's running list before calling it).
- Market-wide: `selectLiquidCandidates`, `computeMarketWideRows`, `productTier`, `productCategory`, `passesMarketWideFilters` (`src/engine/industry/marketWide*.ts`).
- BPC: `bpcSearch.ts` (see 5).

## 12. Consolidated observed gaps

- No completed-job history anywhere (`include_completed=false`); Records excludes unlogged jobs.
- Log production unavailable for corp jobs; no corp dimension in the production log.
- Price history and row menus missing on desktop Opportunities: see section 6 gaps and Q17.
- Market-Wide: fixed hub, ME-0 approximation, no compare, no data-age badge.
- Ranked auto-recalc capped at 10 blueprints; manual Refresh above.
- BPC Sourcing: 200-row cap, 10-type market BPO lookup, owned rows inert, active Character only for owned.
- Records tab has no settings gear; date filter is the only filter.

## 13. Exact formulas, thresholds, edge cases

Fee primitives (`src/engine/industry/fees.ts`, `jobCost.ts`), used by Ranked, Market-Wide and Records:

- Sales tax % = 7.5 x (1 - 0.11 x Accounting) (`fees.ts:18,35-38`). Levels asserted integer 0..5, else RangeError.
- Broker fee % = max(0, 3 - 0.3 x Broker Relations - 0.03 x faction standing - 0.02 x corp standing); fee = max(100 ISK, value x %), 0 when value <= 0 (`fees.ts:20-24,41-53,61-70`). Standings absent = 0 (the UI says "Assumes base standings" via `AssumesBaseStandingsNote`).
- Job fee = EIV x systemCostIndex x (1 - structureBonus%) + EIV x 4% (SCC) + EIV x facility tax% (NPC station 0.25%, structures default 0) (`jobCost.ts:32-45`; SCC 4% = `SCC_SURCHARGE_PCT`, `types.ts:394`; NPC station 0.25% = `FACILITY_PRESETS.npcStation`, `types.ts:217-226`). EIV = ME0 quantities x ESI adjusted price x runs; missing adjusted price counts 0; ME does not reduce it.

Ranked (Build Opportunities), per owned manufacturing blueprint:

- Priced runs = BPC remaining runs, BPO (-1) = 1 (`features/industry/opportunities.ts:170`). So a BPO ISK/hr is a one-run rate, not a batch rate.
- Candidate inclusion: SDE-known, `activity !== 'reaction'` (`features/industry/opportunities.ts:59-69`, skip at :69). Row id `characterId:item_id`: two stacks of the same BPC are two rows (phone folds by `identicalBlueprintKey`).
- Cost = materials (owned stock claimed free via `takeEveryOffer`, `features/industry/opportunities.ts:155`) + job fee at the remembered manufacturing build system. Owned blueprint = free at top level always, "Include Blueprint Cost" setting ignored (`:318`, decision 20260926-222310).
- Revenue = product qty x runs x hub sell-min (`buildVsBuy.ts:112`). Profit = revenue - sales tax - broker fee - total cost (net always, `:134`). Margin % = profit/revenue x 100 (null at 0 revenue). ISK/hr = profit / (seconds/3600), null when seconds 0 (`:136`). Unit margin = profit / (product qty x priced runs) (`opportunityMetrics.ts`).
- Unpriceable (any unpriced leaf material or no product hub price): profit/ISK-hr null; ranked last, never 0 (`opportunities.ts` engine `rankOpportunities`, `:66`: `?? -Infinity`).
- Order depth = (hub sell-min x hub sell volume) / build cost. >= 3 deep, < 0.5 thin, else moderate; unknown when depth null or cost <= 0 (`engine/industry/opportunities.ts:34-44`). Tone: deep success, thin warning, others default. Depth sort rank deep 3 > moderate 2 > thin 1 > unknown 0.
- Hub per Character = hub of that Character's most recently updated plan, else `DEFAULT_TRADE_HUB` (`:88`); one snapshot per distinct hub. Each row uses its owning Character's skills/implants/standings.
- Cache: `rowsCache` (module-level Map) keyed `hub:id` sorted batch key; `opportunitiesInputsKey` = assumedMe + modifiers + standings + manufacturing facility defaults + each owned blueprint's `item_id:ME:TE`. Excludes assets (churn) and Reaction location. <= 10 candidates: always recompute on mount. > 10: serve if inputs key equal, `needs-refresh` (no rows) if changed, compute if no entry (`decideOpportunitiesCache`, `:458`). Refresh deletes the entry. Pricing in chunks of 5 (`useOpportunities.ts:61`) with `setTimeout(0)` yields; progress re-ranks at most every 500 ms (`:63`).
- The "10-blueprint cap" is only this auto-recompute limit; there is no row cap on Ranked (virtualized).

Market-Wide scan (`engine/industry/marketWide*.ts`, `features/industry/marketWideOpportunities.ts`), order of operations in `runMarketWideScan` (`:101-205`):

1. Candidate products = `marketWideTrees.json` (only market-grouped products).
2. Drop products with no obtainable blueprint (`blueprintSource`, preference owned > market > contract > lpStore). NPC market = market-grouped AND T1/Structure T1 meta group (`blueprintObtainability.ts:45-56`); invention not a source.
3. Apply tier/category/source `include` filter (before cut).
4. Hub product prices (Fuzzwork); troll check `reliableSellPrice`: hub sell-min > 3 x CCP average -> price at average, flagged `capped`; no average (never traded) or no sell order -> unranked; ESI price list unreadable -> check skipped (`marketWideSanity.ts:15-31`, `marketWideOpportunities.ts:141`). Applied before depth so a troll price cannot inflate depth.
5. `selectLiquidCandidates`: depth = price x sell volume must be >= 50,000,000 ISK; then top 5 per Market Group by depth; null group = own bucket (`engine :82-114`, feature `:51,54`).
6. Material prices for survivors = hub sell-min per material; ONE `jobFee` over the whole flattened tree at the NPC station (0.25% tax, no bonus) using the hub system's cost index (`engine :190`).
7. Row excluded if any material unpriced or tree time <= 0 (`:188`). Revenue = sell price x tree output qty; profit = revenue - tax - broker - (materials + fee); margin null at 0 revenue; seconds = `jobDurationSeconds(tree.time, 1 run, TE 0, modifiers, NPC ctx, blueprint skills)`; ISK/hr = profit/seconds x 3600 (`:193-213`). ME is 0 (no research, no owned stock, no auto-build).
8. Rank by ISK/hr desc with same depth classification as Ranked. Max-build-cost, hide-gated and hide-rarely-sold narrow after ranking.

- Rarely sold: `averageDailyVolume` = units in last 30 days summed over 5 trade-hub regions / 30 (zero-trade days count as 0); `< 5` per day = rare (`marketWideSanity.ts:34-61`). History fetched only while the filter is on; unreadable = stays visible.
- Tier map: meta groups 1,54 -> tech1; 2,53 -> tech2; 14 -> tech3; 4,52 -> faction; undefined -> tech1; any other -> special. Category by root market group (4 ships, 9 modules, 955 rigs, 11 ammo, 157 drones, 475 components, 477/2202/2203 structures, 24 implants, else other) (`marketWideFilters.ts`).
- Known undercount: single `jobFee` over a flattened multi-tier tree undercounts vs real per-job fees (engine doc `:150-156`).

BPC Sourcing (`engine/contracts/bpcSearch.ts`):

- `effectivePrice` = buyout for an auction with buyout, else `price` (starting bid) (`:440`).
- `iskPerRun` = price / (runs x quantity); null if multi-type bundle, price <= 0 (barter/giveaway), runs <= 0 or quantity <= 0 (`:475`). Divides by all copies in the listing.
- `bpcPriceSummary`: cheapest, cheapest per run, median (not mean), best ME and best TE taken independently (may come from different contracts). Offer = contract row, not copy.
- `bpoMayBeCheaper`: BPO price <= copy's effective price; never for bundles or zero-price barters; auction judged on starting bid; tie goes to contract BPO (decision 20260922-165702).
- Market BPO lookup: picked blueprint, else 10 closest name matches, 300 ms debounce (`useMarketBpoOrders.ts:32,35`); Region = All uses pilot's market-hub region.

Job slots (`engine/industry/jobSlots.ts`): max = 1 + basic skill + advanced skill per pool (manufacturing Mass Production/Adv; science Lab Operation/Adv shared by TE, ME, copy, invention; reaction Mass Reactions/Adv). Running = jobs with `endMs > now` per pool. Multi-Character summary sums only Characters with both skills and jobs known; undefined when none. `projectJobFinish` = now if a slot is open else earliest-freeing job's end (`running - max`-th earliest), + seconds.

Realized profit (`engine/industry/realizedProfit.ts`): total cost = material + job fee (snapshot, editable at log time); gross revenue = confirmed sale lines only; sales tax on all gross; broker fee only on watched-order revenue; profit = gross - tax - broker - total cost; margin null at 0 revenue. `soldUnitsMargin` = net revenue - (cost/qty x min(sold, qty)); unsold cost = remainder. Headline is conservative (all cost charged before all units sell); sold-units margin is the provable view (issue #1785).

## 14. Why (decisions and ADRs)

- ADR 0006 (`docs/adr/0006-build-plan-dual-verdict-and-profit-toggle.md`): build-vs-buy verdict (acquisition, no fees) is separate from sell profit (net of tax/broker); gross/net toggle lives on plan Results. Opportunities rows always rank on the NET figures (`rankOpportunityRows` feeds `result.iskPerHour`, net), so a row can read profitable here while the plan's "buy" verdict differs.
- ADR 0013 (`docs/adr/0013-public-bpc-contract-search-via-shared-firestore-cache.md`): ESI has no contract search; EVE Ref scrape fetched by scheduled function, streamed, written as ~2,000-row chunks plus `meta` (~3,000 writes/day vs ~1.1M for per-contract docs); first non-per-character Firestore collection, admin-write, signed-in-read; ~123k copy rows in the 2026-09-08 pull; renamed `publicContractOffers` (2026-09-12), BPC filtering moved to browser; feature unavailable without Firebase sync; staleness = last snapshot served.
- ADR 0015: tab = path segment, view state in URL (`replace` history).
- ADR 0002 (Fuzzwork hub prices), ADR 0003 (ESI order books for market BPO lookup).
- Decisions (`docs/context/decisions/`): `20260911-081120` (50M floor, top 5, ME-0 approximation), `20260928-223018` (obtainable-only, filter before cut, owned = character not corp, contracts any region), `20260929-050347` (tier/category/source filters re-scan, max cost post-rank, all-on in URL), `20260929-055141` (troll 3x, rarely sold 5/day, 5 regions, off by default), `20260926-222310` (owned free, per-Character standings, per-hub batches), `20260926-213327` (hydration gate), `20260905-181537` (manual snapshot not FIFO; per-allocation Dexie/Firestore rows), `20260926-212411` (remove Character deletes its log), `20260922-165702` (BPO flags, lazy 10-type lookup), `20261003-112230` (200 cap, export ignores cap), `20261004-153656` (remembered Source picks), `20261006-162216` (LP source), `20260908-203708` (name match minus "Blueprint"), `20260924-154255` (combobox), `20260929-102524`/`20260929-184545` (corp jobs return, no ghost note), `20260910-090144` (slot chip to tooltip).

## 15. Persistence and sync map

- Dexie + Firestore sync (per Character): `productionRuns`, `productionSaleLinks`, `productionOrderWatches`, build plans. Merge is last-write-wins per document; per-allocation rows avoid cross-device drops.
- Dexie cache only: ESI jobs/blueprints/orders/wallet (`esi/cache.ts`), global-cache contract snapshot (30 min stale window).
- URL (replace history): all keys in section 8. Device-local (localStorage-style settings): `bpcSearchVisibleColumns.v2`, `bpcSearchSpaceFilter`, `bpcSourcingSources`, `ownedBlueprintsVisibleColumns`. Synced Settings: `sync.bpcHideAuctions`, `sync.bpcHidePlex`, `sync.loyaltyLpValue`.
- Memory only: Ranked `rowsCache` (lost on reload, so a >10 batch recomputes on first visit after reload), Market-Wide scan results (no persistence; scan is opt-in each visit).

## 16. Missing-scope behavior

- No blueprints scope: header `GrantBanner`; Ranked/All owned empty; BPC Sourcing owned source empty (401/403 resolves empty).
- No jobs scope: reauth banner/ghost banners in Active Jobs; no cache fallback on 403.
- No corp jobs/blueprints scope or role: corp rows/toggle absent, no app-wide banner.
- No wallet scope: Link Past Sale picker cannot list transactions; no orders scope: Watch Open Order cannot list orders.
- No LP scope: LP source adds nothing; Market-Wide notes "sources unavailable".
- Firebase not configured or offline uncached: contract source empty; BPC Sourcing shows `notConfiguredTitle`; Market-Wide names the failed source.
- Fuzzwork/ESI price failure: Ranked rows unpriceable (null, last); Market-Wide job fee degrades to 0 (`snapshot.systemCostIndex ?? 0`).

## 17. Test coverage (where behavior is pinned)

- Engine: `opportunities.test.ts` (classifyOrderDepth boundaries, null last, custom thresholds), `marketWideOpportunities.test.ts` (floor, top-N, null group, net of tax/broker, skills shorten time, unpriced excluded, margin null at 0 revenue, parity with owned panel), `marketWideSanity.test.ts` (troll ratio boundary, 30-day window, regions summed, threshold), `realizedProfit.test.ts`, `jobSlots.test.ts`, `bpcSearch` tests, `contractOffers` tests.
- Feature: `features/industry/opportunities.test.ts` (31 cases: candidates, hub grouping, cache decisions, inputs key), `OpportunitiesPanel.test.tsx`, `MarketWideOpportunitiesPanel.test.tsx` (21), `ProductionLogPanel.test.tsx`, `ActiveJobsPanel.test.tsx` (40), `logProductionFromJob.test.ts`, `throttledRanking.test.ts`, `marketWidePage.test.ts`, `opportunitiesCsv.test.ts`.
- E2E (narrow geometry): `e2e/opportunitiesNarrow.spec.ts`, `industryActiveJobsNarrow.spec.ts`, `industryRecordsNarrow.spec.ts`, `industryProductionProfitChartNarrow.spec.ts`, `bpcSourcingNarrow.dev.spec.ts`.

## 18. Interview Q&A

1. Q: What is the "10-blueprint cap" on Opportunities? A: Not a row limit. `AUTO_RECALCULATE_MAX = 10` (`features/industry/opportunities.ts:439`): at <= 10 owned candidates the panel always reprices on mount; above, rows are served from the in-memory cache and a changed inputs key demands a manual Refresh (`:458`), because pricing hundreds of blueprints is slow and was meant to be user-triggered (#642, #2056).
2. Q: What does ISK/hour mean for a BPO vs a BPC? A: Both price one set of runs: BPC = remaining runs, BPO = 1 run (`:170`). Net profit / (job seconds/3600) (`buildVsBuy.ts:134-136`). A BPO figure is a per-run rate, not a batch result; unit margin divides by product qty x priced runs.
3. Q: How is order depth defined, and why not volume? A: Hub sell price x listed sell volume vs build cost; ratio >= 3 deep, < 0.5 thin (`engine/industry/opportunities.ts:34-44`). It answers "is there a market of size relative to what I would spend", and unpriceable = unknown, never thin.
4. Q: Why does an owned blueprint ignore Include Blueprint Cost? A: Candidates are owned by construction so there is never an acquisition gap at the top level (`opportunities.ts:318`, decision 20260926-222310). Sub-builds keep normal rules.
5. Q: What stops the Market-Wide scan from ranking joke-priced items? A: Troll check: hub sell-min > 3 x CCP average -> priced at average and flagged; never-traded items dropped (`marketWideSanity.ts:15-31`). Run before the liquidity pass so depth is not inflated (`marketWideOpportunities.ts:141`); the 78.9T ISK/hr incident drove it.
6. Q: How does the scan bound its work? A: Obtainable-blueprint filter and tier/category/source filters first, then 50M ISK sell-depth floor and top 5 per Market Group by depth (`engine :82`), and only then material pricing. Filters before the cut so deeper unobtainable items cannot occupy slots.
7. Q: How accurate are Market-Wide numbers? A: Approximate: ME 0, no owned stock, no auto-build, one NPC-station job fee over the flattened tree (undercounts multi-tier), hub fixed, materials at hub sell-min. Row click opens a real plan for exact numbers (decision 20260911-081120).
8. Q: Who can be a blueprint "source" in the scan? A: Owned by any account Character (not corp), NPC market (market-grouped T1/Structure T1 meta 1/54 or none), any public contract in any region, LP stores of corps the account holds LP with; invention excluded (`blueprintObtainability.ts`, decision 20260928-223018). Preference order owned > market > contract > lpStore decides the label.
9. Q: Why is realized profit conservative, and why broker fee only on watched orders? A: All run cost is charged against sales so far (understates until sold out). Wallet transactions cannot show whether a broker fee was paid (instant sell vs listed order), so fee applies only to watched-order revenue (`realizedProfit.ts:1-20`). `soldUnitsMargin` gives the provable per-sold-unit view (`:96`).
10. Q: Why manual Production Runs instead of FIFO from wallet history? A: Items are fungible; FIFO silently drifts when stock is reprocessed, moved, or lost, and every FIFO tool needs a manual correction UI. Snapshot + explicit links is correct by construction (decision 20260905-181537). Links are separate docs keyed by ESI ids so two devices cannot overwrite each other and one transaction cannot link twice (Dexie `add`).
11. Q: How does BPC Sourcing get contract data without ESI search? A: Scheduled Cloud Function crawls EVE Ref's twice-hourly dump into chunked Firestore docs; clients read them signed-in, filter to copies in-browser (ADR 0013, `contractOffers.ts`). Stale window 30 min; Refresh bypasses cache; no Firebase = feature off.
12. Q: Why does "Showing 200 of N" exist and does export respect it? A: Owner asked for a cap with an explicit notice; cap follows the active sort so Price asc keeps the cheapest. CSV exports all matches (`BpcSourcingPanel.tsx:267,1580,1698`; decision 20261003-112230).
13. Q: How is ISK/run computed and when is it blank? A: price/(runs x quantity); null for bundles, zero-price barters, 0 runs (`bpcSearch.ts:475`). Prevents a 3x10-run 30M listing looking worse than it is.
14. Q: How are job slots computed? A: 1 + basic + advanced skill per pool; science pool shared by TE/ME/copy/invention; running = `endMs > now` (`jobSlots.ts:43-90`). Readout tone (per section 3): danger when all slots are open (idle), warning at >= 50% open.
15. Q: Why do Opportunities rows use per-Character hubs and standings? A: A plan belongs to the builder and prices at that Character's most recent plan hub; rows batch per hub (one snapshot each) and "Add to Compare" stamps the same hub so numbers match (#2055).
16. Q: Why is owned stock not part of the cache-invalidation key? A: Assets change on every ESI refresh; including them would demand Refresh nearly every visit (`opportunities.ts:398-402`).
17. Q: Where is price history on desktop Opportunities? A: Not exposed. `OpportunitiesPanel.tsx:636` passes `onViewHistory` only to `MobileOpportunityList`, whose per-card menu item (`:324`) sets `historyItem` and mounts `PriceHistoryPanel` in a modal (`:644-655`) at the row's hub region. The desktop branch (`isDesktop`, `:614-626`) is a `DataTable` with `onRowClick` = Start plan and no `rowContextMenu`/`rowMoreActions`; same for All owned and Market-Wide.

## 19. Observed gaps (additional to section 12)

- Ranked numbers are a one-run snapshot for BPOs; no batch/queue-size or slot-aware throughput (ISK/hr ignores whether the Character has free job slots or finish time).
- ISK/hr ignores sell-through time and order depth when ranking (depth is a label, not part of the score); high ISK/hr on a thin market ranks first.
- Opportunities prices at hub sell-min as the sale price (instant-list assumption), no price-impact for multi-unit runs.
- Market-Wide uses sell-min for materials with no ME research, so BPO owners see understated profit vs the real plan.
- Corp blueprints excluded from Ranked and from the scan's "owned" source.
- Ranked `rowsCache` is memory-only: reload recomputes large batches, and the cache is keyed per batch with no eviction.
- Contract BPO and market BPO sources are off by default; first-time users see copies only.
- Jobs list has no history, no row action beyond Log production, no ETA/queue planning.
- Records has no item/plan search, no Character-account total, and no corp dimension.
- Market-Wide has no data-age badge; ranking can silently omit products whose prices failed (unpriced material excluded, not listed).

## 20. Improvement ideas

- Add batch-aware ISK/hr option (priced runs selector, slot-aware throughput) to Ranked.
- Fold order depth/sell-through (daily volume already fetched for rarely-sold) into a liquidity-adjusted score or sort.
- Expose price history and a context menu on desktop Opportunities rows (parity with phone).
- Show "N excluded: missing price" disclosure on Market-Wide and a data-age badge.
- Include corp blueprints as an opt-in source for Ranked and scan "owned".
- Persist Ranked rows (Dexie) keyed by inputs key so reloads do not force recompute above 10.
- Market-Wide hub picker and ME assumption (reuse `assumedMe`).
- Records: item/plan filter, CSV of run allocations, completed-job import to prefill logging.
- Remember more BPC Sourcing filters (region, price caps) like Source picks.
- Move Market-Wide fee calc to per-sub-job fees to remove the multi-tier undercount.
