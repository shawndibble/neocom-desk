# Market, LP Store, Contract search: feature inventory

Scope: `/market` (Browser, Open orders, History, History > Transactions, Appraisal, Hauling), `/market/lp-store`, and the Item search + Courier tabs of `/contracts`. Source of truth is code; each section cites `path:line`. Glossary terms per `CONTEXT.md`. Decisions: `docs/context/decisions/`. ADRs: 0002 (Fuzzwork prices), 0003 (Browser reads ESI order books), 0013 (public contract snapshot), 0015 (tab = path segment, URL holds view state), 0017 (DataTable stacks by class).

## Summary table

| Feature              | Where                               | Notes                                                                                       |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Market page shell    | `/market`, `src/routes/Market.tsx`  | `MARKET_TABS` (`src/app/pageTabs.ts:126`); page UNGATED, tabs gate themselves               |
| Browser              | `/market/browser`                   | Item finder + ESI order book; Location Mode hub/region/all regions; Jump Range filters      |
| Order book item tabs | Browser item panel                  | Order book, Variations, Price history                                                       |
| Quickbar             | Browser finder column               | Per-character pinned items, drag reorder, price alerts                                      |
| Compare drawer       | all Market tabs when set non-empty  | Prices + Attributes views; scratch set                                                      |
| Open orders          | `/market/orders`                    | All-character worklist by problem; Order Detail modal                                       |
| History (orders)     | `/market/history`                   | Expired/cancelled orders                                                                    |
| Transactions         | `/market/history/transactions`      | Wallet fills with realized margin; reached via History view select (not its own tab button) |
| Appraisal            | `/market/appraisal`                 | Paste list, price at hub, net/refine/LP, Compare Hubs, share link                           |
| Hauling              | `/market/hauling`                   | Hub price-gap scan, Trip Plan, Multibuy                                                     |
| LP Store             | `/market/lp-store[/:corporationId]` | Market sub-view (nav), own route; ISK/LP ranking                                            |
| Contract Item search | `/contracts/search/items`           | Public contract lines from shared Firestore snapshot                                        |
| Courier search       | `/contracts/search/courier`         | Public courier contracts ranked ISK/jump                                                    |
| Page paste           | `src/app/GlobalPasteRouter.tsx`     | Ctrl/Cmd+V routes EFT fit to Fittings or item list to Appraisal                             |

## 1. Route, nav, scopes

- Nav: `/market` is an Economy destination, `gating: 'scope'`, `mobileTab: true`, with sub-view `/market/lp-store` (`src/app/navDestinations.ts:185-195`). LP Store lives under Market (decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`); balances stay on Wallet. `/contracts` is a separate Economy destination (`navDestinations.ts:207`).
- Tabs rendered in the tab bar: Browser, Open orders, History, Appraisal, Hauling (`Market.tsx:859-865`). `history/transactions` is a sixth `MARKET_TABS` entry (tab id containing `/`) reached only via `HistoryViewSelect` inside History (`pageTabs.ts:115-125`). Re-clicking History while inside it keeps the chosen view (`Market.tsx:855`).
- Legacy: `/wallet/transactions` -> `/market/history/transactions`; `/wallet/loyalty[/:id]` -> `/market/lp-store[/:id]` (`LegacyPathRedirect`, `src/app/legacyPaths.ts`, `App.tsx:181`); `/orders` retired into Market (note in `routeScopes.ts:52`).
- Scopes (`src/app/routeScopes.ts`): `/market` UNGATED (`:57`); Open orders/History need `esi-markets.read_character_orders.v1`, Transactions `esi-wallet.read_character_wallet.v1`, each as a panel-level `GrantBanner`; Browser, Appraisal, Hauling need none. `/market/lp-store*` gated on `getCharacterLoyaltyPoints` (`:40,262-263`). `/contracts` UNGATED (`:230`), History tab gates `getCharacterContracts` per tab; search tabs need no scope.
- Page layout: `max-w-[96rem]` on Browser else `max-w-6xl` (`Market.tsx:759`). Header hub picker/refresh described in section 2.1.
- Held at route level so they survive tab switches: `useAppraisal` (pasted list), `useOrderBookOrchestration` (CompareDrawer and Item Detail read it), Compare Set (`Market.tsx:473,493`).

## 2. Browser tab (`/market/browser`)

Default tab (`/market` and unknown segments redirect here; `src/app/pageTabs.ts:126`, first `MARKET_TABS` entry). Finder column (22rem, sticky on `lg`) left, selected item's panel right; phone shows one column at a time (finder, or item with a Back icon button in the panel header: `src/routes/Market.tsx:681-689`). Page width `max-w-[96rem]` on Browser, `max-w-6xl` elsewhere (`Market.tsx:759`). Source: ESI `GET /markets/{region}/orders?type_id=&order_type=all` (public, no scope; `src/esi/endpoints.ts:936`), ADR 0003; catalogue (groups/types/systems/stations/regions) lazy-loaded SDE JSON (`useMarketCatalogue`), not precached. Route is `UNGATED` (`src/app/routeScopes.ts:57`).

### 2.1 Page header (Browser + Appraisal only)

| Control                                    | Behavior                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location Mode chips (Trade Hub / Region)   | Browser only. Device-local pref (`locationMode`), URL `hub`/`region` wins. `Market.tsx:773`                                                                                                                   |
| Trade Hub select                           | `TRADE_HUBS` (`src/market/hubs`). Shown in Hub mode, always on Appraisal. Device-local; a linked `?hub=` is copied into the device setting (`useMarketBrowser.ts:230`, decision `20260926-201312`)            |
| Region select (`RegionSelect`, searchable) | Region mode. Options = baked Market Regions; first option "All regions" = `region=all` (`engine/market/locationMode.ts:ALL_REGIONS`)                                                                          |
| Refresh icon                               | Section aware: Browser re-reads item's order book bypassing 300s TTL; Appraisal re-prices pasted list; if catalogue failed, retries catalogue. Disabled with no item/while loading (`Market.tsx:641-656,831`) |
| Hauling refresh                            | On Hauling tab the header holds Hauling's reload (`HaulingPanel` hands handler up; `Market.tsx:838`)                                                                                                          |

### 2.2 Finder (left column)

| Feature                            | Notes                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search box                         | Filters EVE Market Group tree by item name, min 3 chars (`MARKET_TREE_MIN_QUERY_LENGTH`), debounced write to URL `browser.q` (reload/share restores). Hints: "too short", "closest spellings" (fuzzy, only when no substring match: `lib/fuzzySearch`), capped at 50 matches with total shown (`features/market/marketTree.ts:11-14`). Exact-name match pinned as "Best match" above tree |
| Filter funnel (`BrowserFilterBar`) | Same `BrowserFilterValue` as the scope bar: Distance (Jump Range select + Current System picker), Min quantity, Security chips (high/low/null/etc via `SPACE_KINDS`), NPC stations only. Security + NPC only appear when the book spans stations (Region mode or Jump Range set). Active-count badge. Phone: sheet with draft + Apply. `OrderBookScopeBar.tsx:59-125`                     |
| Market Group tree                  | Expand/collapse, items with type icon, `aria-current` on selected. Search forces matched branches open but user can still collapse (separate `searchCollapsedIds`). `?group=` cross-link pre-expands a category once. Max height 32rem / viewport on desktop. 44px rows on touch. `Market.tsx:156-258`                                                                                    |
| Empty/loading/error                | Spinner while loading; `market.loadFailedTitle` + Refresh retries; "no results" EmptyState                                                                                                                                                                                                                                                                                                |
| Quickbar list                      | Below tree. See section 4.6                                                                                                                                                                                                                                                                                                                                                               |

### 2.3 Item panel header

| Control                                             | Notes                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Pin (Quickbar add/remove)                           | Disabled with tooltip when no active character (Quickbar is per character, Dexie `quickbars`). `Market.tsx:996` |
| Compare (add/remove from Compare Set)               | Opens Compare drawer when set non-empty; see section 4.3                                                        |
| Price alert bell (`ItemPriceAlertBell`)             | Sets above/below target on the Quickbar item (pins if needed); disabled with no character                       |
| Info icon                                           | Show info: the shared Item Detail modal, priced at `orderBookLocation` (`ItemActionsProvider`)                  |
| Required skills disclosure (`ItemSkillsDisclosure`) | Folded; "N of M trained" with a character, else count; open shows same section as Show info (Add to Plan)       |

### 2.4 Scope bar + item tabs

`OrderBookScopeBar` sits above all three item tabs. Says what the book reads: station (name, system, security, jumps away), region (name, station count) or range ("Within N jumps of X, N stations") with Clear range button; info tooltip with scope note when All regions or a range reaches past the header scope (`Market.tsx:708-733`). Filter funnel editable in place. Only way to reach filters on phone once an item is open.

Item tabs (`Tabs`, state `itemTab` in URL `browser.itemTab`): **Order book** | **Variations (N)** | **Price history**.

### 2.5 Order book tab

| Feature                                                | Where                                                                                        | Notes                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary strip: best sell, best buy, spread (ISK and %) | `MarketOrderBook.tsx:OrderBookSummaryStrip`                                                  | Hidden < sm (phone toggle carries best prices)                                                                                                                                                                                                     |
| Hub comparison line                                    | `HubComparisonLine`                                                                          | Only while a Jump Range replaced header scope: hub's best sell/buy vs in-range best, signed %, ("125x" past 10x), jumps link, "View <hub>" button (clears range), Set destination button (Hub mode)                                                |
| Sell and Buy cards                                     | `OrderSideCard`                                                                              | Stacked Sell over Buy at all widths (decision `20261004-100214`). Heading: count + best price. Sell sorted price asc, Buy desc, default; price ties broken by distance (`engine/market/orderBookDepth.ts:sortBookSide`)                            |
| Phone Sell/Buy toggle                                  | `BookSideToggle`                                                                             | One side at a time; other side CSS-hidden (no remount); each segment shows count + best                                                                                                                                                            |
| Columns                                                | `marketOrderColumns.ts`                                                                      | Price, Quantity, Jumps, Location, Security, Expiry; Buy adds Range, Min. volume (off by default). Column picker menu per card (shared pref `marketOrderVisibleColumns`, device-local; unknown ids dropped). Every column sortable (`sortValue`)    |
| Cards layout                                           | `Market.tsx:605-613`, `orderBookWidthsRem`                                                   | Rows become two-line cards on phone or when book is too narrow for picked columns + figure widths (measured via `useElementNarrowerThan`); Location squeezes 16rem to 9rem first                                                                   |
| Row cap                                                | `ROW_CAP = 15` (`routes/Market.tsx:105`)                                                     | "Show all N" button per side; CSV export always covers every row (`source: 'sorted-rows'`, `truncated` flag)                                                                                                                                       |
| Bait flag                                              | `BaitFlag`                                                                                   | Sell price >= 10x best sell flagged, never hidden (`SELL_OUTLIER_FACTOR`, `engine/market/orderBookDepth.ts`)                                                                                                                                       |
| "Mine" highlight                                       | `row-mine` class                                                                             | Rows matching the active character's open order ids tinted + sr-only "my order"; from `loadAllCharactersOpenOrders`                                                                                                                                |
| Row expand                                             | `OrderRowDetail`                                                                             | Click row: remaining/total + filled, issued, fill meter, order value, versus best, expiry + days left, min volume (buy), player-structure note, hidden-column facts, depth ("buying down to here" avg, `bookDepth`), Filter to station, Copy price |
| Row context menu / ⋮                                   | `OrderRowContextMenu`                                                                        | Copy location, Copy price (plain digits, #2294), Show info, Filter to this station, Set waypoint                                                                                                                                                   |
| Station filter banner                                  | `Market.tsx:1147`                                                                            | URL `browser.station`; "Filtered to X" + Clear. Cleared on any item/location change                                                                                                                                                                |
| CSV export                                             | `TableActionsMenu`, `useTableExport` surfaces `market-sell`, `market-buy`; `orderBookCsv.ts` | Per card                                                                                                                                                                                                                                           |
| Notes                                                  | `Market.tsx:1129-1146`                                                                       | Global-market override note (PLEX etc trade in own region, `resolveOrderBookRegion`); jump-range note (`JumpRangeNote`: no Current System / loading); "N regions failed" warning status                                                            |
| Empty                                                  | per side                                                                                     | Sell: nothing selling; with station filter / narrowing filters / blueprint hints. Blueprint with empty book links to BPC sourcing (BPCs are contract only, `bpcSourcingHref`)                                                                      |
| Error                                                  | `orderBookFailed`                                                                            | ESI 420 / Error Budget refusal: distinct "failed" EmptyState with Retry (not "nobody is selling")                                                                                                                                                  |
| Loading                                                | Spinner until first view; All regions keeps previous data while fanning                      |

Engine / data:

- `features/market/orderBook.ts`: in-memory 300s TTL cache (`ORDER_BOOK_TTL_MS`), coalesces concurrent callers; manual refresh bypasses. `truncated` when page cap bit.
- All regions / range: fans out one request per Market Region at concurrency 4 (`ORDER_BOOK_FANOUT_CONCURRENCY`); with a Jump Range, only regions containing in-range systems (`regionsForSystems`, `useOrderBookOrchestration.ts:368`). Waits for hub/mode/filter hydration to avoid double fan-out. Per-region failures counted (`failedRegionCount`), partial book shown.
- Filters (`engine/market/orderBookFilters.ts`): Jump Range and Security fold into one allowed-system set; Min quantity drops `volume_remain < n`; NPC-only drops orders at non-NPC `location_id`.
- Player-structure orders: shown with system + security, never hidden (ADR 0003; ~18% of Tritanium Forge orders).
- Variations/Compare/Item Detail/Price History always read one region (hub's region) even under All regions (`useMarketBrowser.ts:304-307`).

URL state (ADR 0015, `engine/market/urlState.ts`): `type`, `hub`, `region` (id or `all`), `group`, `browser.q`, `browser.itemTab`, `browser.jumps`, `browser.sec`, `browser.minQty`, `browser.npcOnly`, `browser.station`. Precedence: valid region > valid hub > device Location Mode. Each filter has a device-local remembered default (`browserFilterSetting.ts`) behind the URL, "use game location" tracks character's ESI location. Item/location changes push history entries. `marketNearbyParams`: "where's the closest one" link = All regions + `browser.jumps` (URL-only, never stored). Deep links: `/market/browser?type=`.

Browser decisions: `20260831-140406-market-browser-rebuild`, `20260831-140406-the-market-browsers-state-lives-in-the-url`, `20260923-104008-market-browser-all-regions-and-order-book-filters`, `20260923-174003-...hub-region-is-device-local`, `20260927-084218-...filter-bar-remembers-device-default`, `20260929-204125-...jump-range-works-in-every-location`, `20260924-002813-market-labels-name-one-thing-each-order-book`, `20261004-100214-...order-book-rework-scope-bar-stacked`.

### Observed gaps (Browser)

- Compare Set is local scratch; Quickbar is per-character (synced); Quickbar add disabled with no active character, no fallback storage.
- Order book fetch is one item at a time; Quickbar rows show no live price, only an alert target (`QuickbarList.tsx:94-96`).
- Only first 15 rows per side render until "Show all" (CSV unaffected).
- Region catalogue failure => All regions/region picks unavailable (`regionsUnavailable` failed state), no cached fallback.
- Player-structure rows have no name (scope not taken); only structure markets scope opt-in elsewhere.
- Compare Set / Variations / Price History ignore All regions and Jump Range; header copy notes this via `allRegionsSecondaryNote`/`rangeSecondaryNote`.

## 3. Open orders, History, Transactions (Market tabs)

Paths relative to repo root. Tabs from `MARKET_TABS` (`src/app/pageTabs.ts`): `orders` = `/market/orders`, `history` = `/market/history`, `history/transactions` = `/market/history/transactions` (tab id with a literal `/`, not a nested tab; ADR 0015). `/market` is UNGATED (`src/app/routeScopes.ts:57`); each of these three panels gates itself (banner, not page replace). Mounted in `src/routes/Market.tsx:868-883`. Old `/wallet/transactions` redirects to `/market/history/transactions` (`src/app/pageTabs.ts` WALLET_TABS note).

### Summary table

| Feature                          | Where                                                                    | Notes                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Open orders worklist             | `/market/orders`, `OpenOrdersPanel.tsx`                                  | all authenticated characters' open orders, grouped by worst problem                                                      |
| Problem groups                   | `openOrdersModel.ts`, `engine/market/orderProblems.ts`                   | belowFloor, undercutStation, undercutSystem, undercutRegion, expiringOrStale, outbid, healthy; healthy folded by default |
| Problem badge + one-line summary | `OrderProblemBadge.tsx`, `orderBadgeKind.ts`, `OrderRowSummaryText.tsx`  | 10 badge kinds; colour = scope, words always shown                                                                       |
| Badge legend modal               | `OrderBadgeLegend.tsx`                                                   | opened from button under groups                                                                                          |
| Filter bar + chips + URL state   | `openOrdersFilter.ts`, panel :713-960                                    | text, side, problem, cost basis, expiry, ISK tied up, location, character, sort; all in URL `orders.*`                   |
| Column picker                    | `openOrdersColumns.ts`                                                   | where, price, problem, floor, remaining, expires; desktop only                                                           |
| Check deeper (per group)         | `useOrderDetail.ts`, `orderCompetition.ts`                               | on-demand system/region/structure book fetch, reclassifies rows                                                          |
| Order Detail modal               | `OrderDetailModal.tsx`                                                   | verdict, next step, stats, 4 folding sections                                                                            |
| Row context menu                 | panel `rowContextMenu` :587                                              | item menu + Copy new price + Set waypoint                                                                                |
| Phone list                       | `OpenOrdersList.tsx`                                                     | 3-line tap rows, no column picker                                                                                        |
| CSV export                       | `useTableExport` surface `orders-open`, `character/ordersCsv`            | visible rows, ESI order fields                                                                                           |
| Multi-character                  | `openOrdersData.ts`                                                      | strip + badges only when >1 character has orders; per-character reauth                                                   |
| Cost basis / Floor               | `orderCostBasis.ts`, `engine/market/orderFloor.ts`, `walletCostBasis.ts` | Production Run first, wallet FIFO fills the rest                                                                         |
| Frequently undercut flag         | `engine/market/orderProblemHistory.ts`, `orderProblemSamples.ts`         | rolling local samples                                                                                                    |
| Undercut notification            | `features/notifications/events.ts:147`                                   | `marketOrderUndercut`, station tier only                                                                                 |
| History (orders)                 | `/market/history`, `OrderHistoryPanel.tsx`                               | expired/cancelled orders; search, side, state filter, sort, CSV                                                          |
| History view switch              | `HistoryViewSelect.tsx`                                                  | select (desktop) / segmented (phone) between Orders and Transactions                                                     |
| Transactions                     | `/market/history/transactions`, `TransactionsPanel.tsx`                  | personal wallet fills; search/side/date filter, summary strip, margin column, CSV                                        |
| Realized margin                  | `transactionMargins.ts`, `engine/market/realizedMargin.ts`               | FIFO vs own wallet buys minus sales tax                                                                                  |
| Fill highlight                   | `transactionHighlight.ts`                                                | `?highlight=<typeId>` from fill alert -> newest sell of item                                                             |

### Open orders (`/market/orders`)

What: worklist of every authenticated character's open market orders, each filed under the one worst problem. Source: `src/features/market/OpenOrdersPanel.tsx`; data `openOrdersPageSnapshot.ts:loadOpenOrdersSnapshot` (one read shared with Overview board counts, per its header). Design lineage: `docs/notes/open-orders-redesign-feasibility.md`; decisions `20260906-155913-open-orders-reads-as-a-worklist`, `20260906-170442-open-orders-rows-say-what-is-happening-not`, `20260924-001906-open-orders-derives-a-cost-basis-from-personal`, `20260924-013535-order-detail-modal-leads-with-the-call-and`, `20260924-020211-open-orders-gets-a-compact-phone-list-the`, `20260914-135534-often-undercut-flag-samples-on-the-open-orders`, `20260922-221531` (location filter remembered), `20260906-203425-opt-in-structuremarkets-scope-wired-into-station-tier`, `20260908-123516` (notification highlight).

**Data / scopes**

- `GET /characters/{id}/orders` per character, `esi-markets.read_character_orders.v1` (`src/esi/registry.ts:317`). Scope checked up front per character (`openOrdersData.ts` header): never-granted -> `skipped` note ("characterNotShared", panel :694), granted-but-401/403 -> entry with `needsReauth` -> per-character `GrantBanner` (panel :670).
- Station tier: Fuzzwork station aggregates keyed `locationId:typeId` (`orderCompetition.ts:63 loadStationBestPrices`). System/region tier: ESI region order book per type, lazy (`loadRegionCompetition` :102). Player structures: `loadStructureCompetition` :152, needs optional `esi-markets.structure_markets.v1` (`registry.ts:543`).
- Also read: type names, NPC stations SDE (`stationsLoaded` false -> "not checked", never "player structure"), character skills (accounting, broker relations, advanced broker relations), standings per order, Production Run cost bases, wallet transactions (cost basis), Dexie problem samples.
- Cached: `useRouteSnapshot` cacheKey `market:open-orders`; `DataAgeBadge` shows oldest fetch; "offline" label when any entry from cache.
- No active character -> `<Navigate to="/characters">` (panel :524).

**Page header line**: "N characters · N orders · N need attention" (`headerCharacters/headerSummary/headerAttention`), `needsAttentionCount`.

**Panel actions**: refresh icon, `TableActionsMenu` (CSV/export), `DataAgeBadge`.

**Groups** (`openOrdersModel.ts groupOpenOrders`, ORDER_PROBLEMS order in `engine/market/orderProblems.ts:39`): belowFloor > undercutStation > undercutSystem > undercutRegion > expiringOrStale > outbid > healthy. Buy order never belowFloor; buy undercuts collapse to `outbid`. Group header = caret toggle button (fold), title + count, hint line with ISK tied up (`IskAmount`), worst gap %, per-character counts when >1 character (`groupHeaderLine` panel :1162). Left stripe colour by severity (`GROUP_ACCENT` :133). Healthy group has "Show healthy / Hide healthy" text action tied to `hideHealthy` filter (default true, `DEFAULT_FILTER` :114). Per-group "check system and region" icon button (`checkDeeper`, panel :1054). Highlighted row (from notification) forces its group open (`openOrdersView.ts isGroupFolded`).

**Filter bar** (`FilterBar` funnel + search; all fields URL-persisted `orders.*`, `openOrdersFilter.ts`):

- Search: item name or character name.
- Chips: Buy, Sell; one chip per problem (FILTERABLE_PROBLEMS = all except healthy) with live counts, zero-count still shown; cost basis Linked / Missing.
- Selects: Expiring within (any, 3, 7, 14, 30 days); Min ISK tied up (any, 10M, 100M, 1B); Sort (worstFirst, expirySoonest, iskTiedUp, item, character).
- MultiSelect Location (only when >1 distinct location; searchable; remembered device-locally on bare `/market/orders` visit via `openOrdersLocationFilterPref.ts`, URL wins).
- Character: `CharacterFilterControl` (This character / All characters); desktop strip under bar, folded into funnel sheet on phone. Shown only when >1 character has orders (`showCharacterStrip`).
- Active-filter chips row (per-value removable, `activeFilterChips`; hideHealthy excluded), "Clear all", match-count line (hidden when only the healthy fold hides rows, `matchCountVisible`). No-match: `EmptyState orders.noResults`.
- Column picker (`ColumnPickerMenu`, device-local `openOrdersVisibleColumns`): where, price, problem, floor, remaining, expires; `item` always on; `floor` offered only if any visible row has a floor; hidden on phone.

**Table columns** (desktop `DataTable`, one per group, `rowMoreActions`, row click opens modal; columns panel :418-514, table :1085): Item (+ character badge), Location (short name before " - ", full on hover; "Off-hub" warning + InfoTooltip via `isOffHubStation`; "Unknown structure" for unnamed), Price (`formatIskAuto`), Problem (badge + `OrderRowSummaryText`, copy-relist-price affordance), Floor (relist floor, rounded up; "unknown" if none), Remaining (`remain/total`), Expires (date, "unknown" if bad payload). All sortable per column.

**Row actions**: row click / More actions -> Order Detail modal; context menu (`ItemContextMenu` extras): Copy new price (only for undercut/outbid rows, one legal tick under rival, plain digits), Set waypoint (only when station named). Item menu supplies Show info etc. (`ItemContextMenu.tsx`). Note: `OrderRowContextMenu.tsx` (copy location/price, filter to station) is the Browser order book's menu, not this tab's.

**Mobile**: below `sm` `OpenOrdersList.tsx` replaces `DataTable`: line 1 item/character/price, line 2 badge (non-interactive, no "?") + sentence, line 3 remaining, floor (if any), Off-hub. Whole row is a button opening the modal, `RowMoreActions` beside it. Location and expiry dropped (in modal). No column picker. Highlight row scrolls and pulses (`useScrollToRowKey`).

**Order Detail modal** (`OrderDetailModal.tsx`, `OrderDetailContent`; title "character · item", `placement="wide"`; remounts per order, keyed by `orderId`; every Disclosure starts folded; page-level caches in `useOrderDetail.ts`, loads via `useOpenOrderDetail`, view from `orderDetailView.ts assembleOrderDetailView`):

- Layout: top row = "Quick answer" card (19rem) + stat grid; then "Who is cheaper" Disclosure; then, sell orders only (#1733), cost basis and exits cards side by side. Buy orders get neither, and the scope section reads "Who bids higher".
- Quick answer: badge; verdict (`orderVerdict.ts`: raisePrice / matchThem / letGo / leaveItAlone; needs Floor + sell order, `:690`) else the badge's action text, else "not checked"; "Next step" (`orderNextAction.ts`: raisePrice and matchThem are copyable via `CopyablePrice`; keepAt, cheapestRival plain; `badgeAdvice` prints nothing, badge text already says it); Floor row (rounded UP via `roundPriceUp`, red when price < exact relist, `floorHelp` tooltip, caption names Production Run vs wallet vs no basis); `OrderRowSummaryText`; "View in Market" link (phone list rows are not links); outbid buy order: copyable suggested bid (`outbidSuggestion`).
- Stat grid (phone: "numbers" Disclosure with sell-out read as trailing; desktop always open): My price (+ "rank N of M" at station, only from a complete untruncated region book, `stationRank`); Sells out in / Fills in for buys (`computeSellThrough`: remaining / region avg units per day over last 30 d of price history x my share of same-side units priced at-or-better from the deep book, share 1 before it loads; danger tone + "past expiry" line when days > days left; no history = unknown, never invented); Volume left (`remain / total` + meter); Order expires (days left, warning <= 7 d, caption with expiry and listed dates); "If it sells / fills as listed" (`price - floor.fill`, signed, per unit after fees; unknown without a Floor).
- Who is cheaper (trailing = tightest rival scope + price, or clear / not checked): one shared div-table grid (`role=table`): Scope pill | cheapest seller (location + "N sellers under me · N units", or "aggregate only" for the Fuzzwork station tier) | their price | over by (ISK + %) | distance (same station / same system / jumps via `JumpsAwayText`); over-by and distance collapse into labelled lines below md; "My order" row last. Per-scope states: unavailable (player structure without structure-markets scope or ACL), notChecked (deep not fetched, truncated book, system id unrecoverable), clear, rival. Truncated deep book shows an "incomplete" note; "only seller" note when all clear (sell side); "Check deeper" button until `deep` loads (`onCheckDeeper`), "checking" line meanwhile. Header `TableActionsMenu` exports the grid (surface `market-scope-orders`, `scopeOrdersCsv.ts`).
- Cost basis / floor working (sell only): no basis = static card (no Disclosure) with title, hint, wallet gap message (partial N of M units / history short, + truncated) and "Plan in Industry" link. With basis = Disclosure, trailing "cost / unit"; ledger is Production Run (quantity, material cost, job fee, total) or wallet (units covered, buys, date range, per-buy lines, "no buy fee on wallet buys"), cost per unit, sales tax + relist broker fee (`relistFees`; sum with cost to the floor), Floor; break-even note; "why broker" box (relist vs fill difference); build link.
- Exits (sell only; trailing = best exit net per unit, else best hub gap, else "no exit"): hold (sales tax only, `floor.fill`; label adds "sells in N d" when known), undercut station (relist, `floor.relist`; the only copyable price), dump to highest buy order, reprocess (needs SDE reprocessing + refine quote; states base-station assumption (`BASE_STATION_REPROCESSING_RATE` = 50%), refine implant % only when it moved the number, `ImplantsAssumedNote`, partial and leftover lines); each with signed net per unit. "Haul to another hub" block (`hubHaulGaps`: hub bid, jumps, over-local gap, no net; loading / unavailable / none). No reprocessing data shows "not built" (`:1243`). Last line is the `orderSoFarNotBuilt` placeholder (`:1289`).

**Badge legend modal** (`OrderBadgeLegend.tsx`): lists ORDER_BADGE_KINDS (belowFloor, undercutStation, undercutSystem, undercutRegion, expiring, outbid, frequentlyUndercut, best, topBid, noCostBasis) with meaning + action, colour rule note.

**Engine calcs**

- `orderProblems.ts`: one worst problem by fixed precedence; `allProblems` returns every applicable (filters overlap by `problems`).
- `undercut.ts`: nested scopes station => system => region; `worst` = tightest scope with rival; absent scope = not checked (distinct from clear).
- `stationUndercutState.ts`: beaten/clear/unknown; null best price = unknown (failed fetch), not "no rival".
- `orderFloor.ts`: `relist` = break-even for a lower reprice (Relist-Discounted broker + tax, 100 ISK min fee), `fill` = sales tax only; fill <= relist.
- `orderHealth.ts`: `orderExpiry` (issued + duration days; null on bad input), `sellThrough` (tagged unknown when no volume).
- `orderProblemHistory.ts`: undercut share > 50% of in-window (7 d) samples, min 12 samples, 4 min spacing, max 512 per order -> `frequentlyUndercut` (only on otherwise healthy rows; beats `best` badge).
- `walletCostBasis.ts`: FIFO personal buys; basis = weighted avg of newest `pool` units on open sell orders; only when history covers all units, else `partial` / `historyShort`.
- `realizedMargin.ts`: see Transactions.
- `fillTime.ts`: matches a filled order to wallet sales (item, station, price, after issued); `pending` / found / none. Used by fill notifications, not shown in this tab.
- `orderSlots.ts`: `maxMarketOrders` = 5 + 4 Trade + 8 Retail + 16 Wholesale + 32 Tycoon per level; used only by `src/routes/Overview.tsx:39`, not by Open orders.
- `priceTick.ts`: legal undercut price (one tick below, 4 significant figures; decision `20260924-002508`).

**Notifications link**: `marketOrderUndercut` (`events.ts:147`, default both channels, scope `getCharacterOrders`; station tier only, undercut for sell / outbid for buy) and `marketOrderFilled` (default feed only; destination `/market/history/transactions`, `notificationOptions.ts:75`, row highlight). Both deep-link with `?highlight=`.

### History (`/market/history`)

What: character's expired + cancelled orders (ESI order history). `OrderHistoryPanel.tsx`.

- Data: `GET /characters/{id}/orders/history`, scope `esi-markets.read_character_orders.v1` (`getCharacterOrderHistory`), paginated; `truncated` flag -> "incomplete" warning. cacheKey `market:order-history`. Active character only.
- Header: `HistoryViewSelect` (Orders | Transactions), refresh, `TableActionsMenu` (CSV surface `orders-history`, filtered rows, `orderHistoryCsvColumns`), data age.
- Filter bar (`orderHistoryFilter.ts`, URL `history.q`, `history.side`, `history.state`, `history.sort`): search (item name), Buy/Sell chips, Expired/Cancelled chips; funnel count excludes text; column picker (side, price, remaining, issued, state; device-local `orderHistoryVisibleColumns`; hidden on phone). Default sort issued desc.
- Columns: Item, Side, Price, Remaining, Issued (date), State (phone hidden). `DataTable` virtualize auto, `responsive="table"` (horizontal scroll on phone).
- States: spinner (not hydrated / first load), error `loadFailedTitle`, reauth `GrantBanner` (:327), empty `CachedEmptyState`, offline banner, no match + "Reset filters".
- Item cell: no context menu or detail modal in this table (`DataTable` at :389 gets no `rowContextMenu`).

### Transactions (`/market/history/transactions`)

What: character's buy/sell fills; corp fills live on `/corp/wallet`. `TransactionsPanel.tsx`.

- Data: `GET /characters/{id}/wallet/transactions` (`esi-wallet.read_character_wallet.v1`; `loadWalletTransactionsWithStatus`, page cap -> `truncated` warning) + wallet journal (only for Margin; failure blanks Margin, not the tab). cacheKey `market:transactions`.
- Header: `HistoryViewSelect`, refresh, `TableActionsMenu` (CSV surface `wallet-transactions`, filtered rows), `DataAgeBadge`.
- Filter bar: reuses `TransactionsFilterBar` from `src/features/corp/CorpTransactionsPanel.tsx:94` — search, Side select, From/To date fields; URL `transactions.*` (`walletTransactionFilter.ts`).
- Summary strip (`TransactionsSummaryStrip.tsx`): date range, Sold / Bought / Net over filtered rows.
- Columns: Date (`formatTimestamp`, user time zone), Item (`ItemInfoLink`, sticky start), Side (phone hidden), Quantity, Unit price, Total (signed, toned), Margin (phone hidden, header tooltip, cell tooltip shows unit cost + sales tax; "—" if no margin; blank on buys). Default sort date desc; all columns sortable. Virtualized.
- Highlight: `?highlight=<typeId>` -> newest sell of that item (`transactionHighlight.ts`), pulsed.
- Margin: `transactionMargins.ts` links `transaction_tax` journal lines to fills (`journalTransactionLinks`), then `realizedMargins`: FIFO personal buys as lots; sale margin = total - lot cost - sales tax; none when tax line missing, units not covered by wallet buys, or the type outran its buys (then no margins for that type). Broker fees not included. Computed over all fills, not filtered rows.
- States: spinner, error, reauth `GrantBanner` (`getCharacterWalletTransactions`), empty, offline vs "refresh failed" copy (`refreshCount`), truncation warning, no filter match + Reset filters.

### Observed gaps (code facts)

- `OrderDetailModal.tsx:1289` renders `orderSoFarNotBuilt` placeholder as the last line of the Exits section (sell orders only); `exitReprocessNotBuilt`/`exitNotBuilt` shown when reprocessing data is absent (:1243). Feasibility note's "order so far" / reprocess gap still visible in UI.
- `transactionDays.ts` (phone day groups + strip) is imported only by `TransactionsSummaryStrip.tsx` for the summary; `TransactionsPanel.tsx` renders the same `DataTable` on phone (`responsive="table"`, Side and Margin hidden). Comment at `TransactionsPanel.tsx` ("phone day list keeps its own strip and no filter bar or margin") no longer matches the code: phone gets the filter bar and horizontal-scroll table. No phone day list found.
- Notification events from the feasibility note: only `marketOrderUndercut` (station tier) and `marketOrderFilled` exist in `events.ts`; no `orderUnderFloor`, `orderExpiring`, `orderStale` events (grep of `src/features/notifications` found none). Proposed thresholds table (scope, min gap, min rival stock, repeat suppression) and "try on today's orders" replay: no match in notifications code.
- Order slots / capital tied up: `maxMarketOrders` is used only on Overview (`routes/Overview.tsx:39`), no slots usage line on Open orders.
- Open orders context menu has no "filter to station" or "copy location" (those exist only on Browser book `OrderRowContextMenu.tsx`).
- Order History table has no row actions, context menu, detail modal or per-character view; active character only (cf. Open orders all-characters).
- History table has no fill time/state detail; `fillTime.ts` engine is not surfaced in History or Open orders.
- Transactions: personal only; no all-characters view; Margin is before broker fees (`realizedMargin.ts` header) and blank for any sale lacking a journal tax line (journal can reach back shorter than transactions).
- Open orders is active-character gated for load error/redirect (`Navigate` to `/characters`) even though data spans every authenticated character.
- Price alert: no price-alert action on Open orders rows; alerts reachable only from Browser item header bell (`ItemPriceAlertBell.tsx`) and item context menus (`PriceAlertDialog.tsx`, `ItemContextMenu.tsx`).
- Location filter remembered device-locally but other filters are not (only URL), so a bare `/market/orders` resets them each launch (`OpenOrdersPanel.tsx:176-192`).

## 4. Appraisal, Hauling, Compare, Variations, Price History, Quickbar (Market page)

Summary table

| Feature             | Where                                                                 | Notes                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Appraisal tab       | `/market/appraisal`, `src/features/market/AppraisalPanel.tsx`         | Paste list, price at one Trade Hub, Price Percent, net-of-fees, refine, LP, share                                                                      |
| Compare Hubs        | Appraisal, foldable under result, `HubCompareCards.tsx`               | Same pile at all 5 hubs, sell/buy totals, click copies                                                                                                 |
| Share Link          | Appraisal header IconButton; `AppraisalShareScreen.tsx`               | Firestore snapshot, 7-day TTL, read-only view                                                                                                          |
| Copy menu           | Appraisal header IconButton                                           | Copy sell list (`name<TAB>price`, one tick under hub, for Import Prices) and Copy multibuy (`name<TAB>qty`, net of owned when Minus owned is on)       |
| Recent              | Appraisal paste card select; `appraisalRecent.ts`                     | Last 5 pastes by raw text, re-priced on load; local only; Clear recent                                                                                 |
| Minus owned         | Appraisal paste card checkbox + station select; `appraisalOwned.ts`   | Subtracts every Character's hangar stock at a Trade Hub station (default header hub); needs assets scope; Need/owned column, covered rows dim and sink |
| Hold bar            | Appraisal result, `AppraisalHoldBar.tsx`                              | Packaged volume vs Hauling Cargo Space; only when one is set                                                                                           |
| Header groups       | `AppraisalHeaderStats.tsx`                                            | You get / It's worth / Cargo, one emphasised figure each                                                                                               |
| Hauling tab         | `/market/hauling`, `HaulingPanel.tsx`                                 | Hub-to-hub price-gap scan, Trip Plan, Copy Multibuy                                                                                                    |
| Cargo space popover | Hauling trip bar, `HaulingCargoControl.tsx`                           | Ship / saved Fitting / custom m3 + ISK budget                                                                                                          |
| Compare drawer      | Market (all tabs when set non-empty), `CompareDrawer.tsx`             | Prices + Attributes views, resizable bottom drawer                                                                                                     |
| Variations tab      | Browser item panel, `VariationsTable.tsx`                             | Tech/meta siblings priced at scope; Compare button                                                                                                     |
| Price History tab   | Browser item panel, `PriceHistoryPanel.tsx` / `PriceHistoryChart.tsx` | ESI daily history, 7d/30d/90d/1y, MA line, day table                                                                                                   |
| Quickbar            | Browser finder column, `QuickbarList.tsx`                             | Per-character pinned items, drag reorder, price alert per item                                                                                         |
| Price alerts        | Quickbar row, header bell, item menu; `PriceAlertForm.tsx`            | Target price above/below vs lowest sell at the Market hub, stored on Quickbar item                                                                     |
| Page paste          | `src/app/GlobalPasteRouter.tsx`                                       | Ctrl/Cmd+V off-field routes EFT fit to Fittings or item list to Appraisal                                                                              |

Decisions cited (docs/context/decisions/): `20260908-164742-appraisal-prices-at-a-trade-hub-and-shares`, `20260908-180023-an-appraised-row-is-an-item-link-menu`, `20260911-110045-appraisal-share-links-encode-base36-pairs-no-compression`, `20260914-180533-appraisal-reads-an-eft-fit-on-its-own`, `20260924-010954-appraisal-shows-net-of-fees-totals-at-100`, `20260924-124701-appraisal-undercut-lists-one-tick-under-the-hubs`, `20260924-131419-appraisal-undercut-becomes-a-bulk-sell-list-copy`, `20260906-215500-hauling-is-a-hub-price-gap-and-a`, `20260926-161750-hauling-opportunities-v1-scope`, `20260929-235337-hauling-opportunities-selling-into-buy-orders`, `20260930-004332-hauling-opportunities-any-hub-at-one-end`, `20261004-233720-hauling-lots-are-capped-at-a-share-of`, `20260910-091729-price-history-moving-average-window-fixed-7-days`, `20260914-124036-price-history-keeps-every-esi-history-field-and`, `20260914-132059-price-history-polish-a-series-token-and-no`, `20261001-211035-page-level-paste-offers-fittings-or-appraisal`, `20261002-133425-page-level-paste-opens-fittings-or-the-appraisal`, `20260923-174003-market-browsers-current-hub-region-is-device-local`. ADR 0002 (Fuzzwork for hub prices), 0003 (ESI order books for Browser), 0015 (tab = path segment).

Scopes: `/market` is `UNGATED` (`src/app/routeScopes.ts:57`). Appraisal, Hauling, Compare, Variations, History need no ESI scope. Optional enrichment with an active Character: skills (`esi-skills`) for net-of-fees and refine, LP balances (`esi-characters.read_loyalty`, via `getCharacterLoyaltyPoints`) for LP column. No character = those features absent, not errored.

---

### 1. Appraisal tab

Route `/market/appraisal` (MARKET_TABS id `appraisal`, `src/app/pageTabs.ts`). State lives at route level in `useAppraisal` (`useAppraisal.ts`) so a paste survives a trip to the Browser tab; panel is `AppraisalPanel.tsx`.

Layout: grid, paste Panel left (21rem on lg), result Panel + foldable Compare Hubs right (`AppraisalPanel.tsx:463`).

Page header (shared with Browser, `Market.tsx:140,763`): Trade Hub select (no Location Mode chips, no Region mode on Appraisal; reason: Fuzzwork aggregates are per station) and a Refresh IconButton. On Appraisal Refresh re-prices bypassing the Fuzzwork TTL (`invalidateHubPrices`, `appraisalData.ts:181,274`); disabled until a result exists or while loading (`Market.tsx:831`).

Paste panel

- TextArea 14 rows, mono, Ctrl/Cmd+Enter submits (`onSubmitChord`). Typing does not re-price; Appraise button does (`useAppraisal.ts` header doc).
- Lines chip: count of paste lines (`countPasteLines`), differs from row count because repeats merge.
- Price Percent number field (0-1000, default 100, `pricePercent.ts:19-27`), device-local setting `useMarketPricePercent`; field holds typed string, writes only when in range (`AppraisalPanel.tsx:268`). `?percent=` URL param overrides for one visit (`Market.tsx:304`), cleared when user types.
- Appraise (primary, disabled when empty/loading), Clear (disabled when empty).
- Unmatched box: names that resolved to no market type, listed with source line numbers (`market.appraisal.unmatchedLine`).
- Changing hub or percent after a result exists re-prices automatically (effect deps in `useAppraisal.ts`).

Accepted paste shapes (`src/engine/market/appraisalPaste.ts`): inventory copy `Name<TAB>Qty[...]`, multibuy `Name Qty` / `Name xQty`, bare name (=1), EFT fit (header `[Ship, Fit]`; hull priced, charges priced separately, empty slots dropped; via `engine/import/eftFit`). Thousands separators stripped. Trailing digits only split off when no tab and digits-only token. Duplicate names merge. Name matching `appraisalMatch.ts`, catalogue `loadAppraisalCatalogue` (first type id wins on duplicate names, `appraisalData.ts`).

Entry points into Appraisal besides typing: Fitting Export menu and page-level paste send `location.state.appraiseText` (`Market.tsx:480`); Quickbar "View in Appraisal" (opens Compare Hubs expanded, `Market.tsx:351`); Shared Appraisal "Open Neocom Desk" (`?share=<id>&hub=&percent=`, `sharedAppraisalSeed.ts`; param stripped after read).

Result panel

- Header meta chip: hub name + "at N%".
- Actions: ColumnPickerMenu (optional columns, device-local `appraisalVisibleColumns`), Share, Copy sell list, TableActionsMenu (CSV).
- StatChips: Sell total (accent), Buy total, Instant net, List net, Spread, Refine total (only if any row has refine), Cheapest buy (only if any row has an LP option), Total volume (`AppraisalVolumeChip`), Items count. Sell/Buy use `FullIskTotal`; others `IskAmount` shorthand with exact on tap/hover.
- Notes above table (conditional): "net always at 100%" when percent != 100; assumes-base-standings note; refine assumes no implants (ore/ice only); unpriced rows count (warning); refine-unpriced count; "cheapest buy via LP" count.
- Table (`DataTable`, rowKey typeId, `stackColumns={2}`, `mobileSort`, `rowMoreActions`, `rowContextMenu` = `ItemContextMenu`):
  - Always: Quantity, Item (MarketItemLink -> Browser).
  - Optional (picker): Buy each, Sell each, Buy total, Sell total, Refine total, LP total, Volume (m3, packaged). All sortable (`sortValue`); null sorts last.
  - Highlighting: Buy total bold green when refine does NOT beat sell-as-is; Refine total bold green when `refineBeatsSellAsIs`; `*` hint if refine partly unpriced; `!` hint when refine only wins because leftover units sell on top; LP total bold when `lpBeatsMarket`, `*` hint when LP unaffordable; LP cell carries `LpStoreLink` icon to `/market/lp-store/:corp`.
  - Each-price via `formatIskAuto`; totals via `IskAmount`; missing price is a dash, never 0.
- States: loading spinner (first result only), `failed` (catalogue load) EmptyState, empty (no result), no-matches EmptyState; a re-price shows an inline small spinner in the chip row.
- Mobile: paste panel stacks above result; table becomes 2-column stacked cards; sort via mobile sort control.

CSV (`appraisalCsv.ts`, surface `market-appraisal`): Quantity, Item, Buy each, Sell each, Buy total, Sell total, Volume. Raw numbers at chosen percent; null exports empty. Refine and LP columns are not exported.

Copy sell list (`appraisalSellListText.ts`): one line per item `name<TAB>price`, price = one tick under hub's cheapest sell (`appraisalUndercut`, `priceClipboardText`); no quantity (Import Prices matches by name); items nobody sells or already at 0.01 are skipped; button disabled if none.

Share (`handleShare`, `AppraisalPanel.tsx:190`): snapshot of priced items (`buildAppraisalSnapshot`, max 1000 items, `appraisalSnapshot.ts`) stored via `createShareLink({type:'appraisal'})` (`features/share/shareStore.ts`, `SHARE_TTL_MS` 7 days, Firestore TTL on `expiresAt`); same pile reuses same link (`existingShareLink`); link copied to clipboard; if clipboard refused after await, a read-only URL field + Copy button appears ("manual" state). Disabled when: no character, sync not configured (`isSyncConfigured`), no rows, >1000 items, saving. Tooltips for saving/failed/copied/too large.

Shared Appraisal view (`AppraisalShareScreen.tsx`, route `routes/SharedLink.tsx`): read-only, hosted in `ShareShell`; shows hub + percent chip, Sell total, Buy total, Generated and Expires chips, table (Quantity, Item, Buy each, Sell each, Buy total, Sell total, Volume), CSV menu, "Open Neocom Desk" button (carries pile into live tab). Rebuilt with `buildAppraisal` at stored prices (`appraisalShareData.ts`); no refine/LP/net (depend on sharer's character). Invalid/expired = EmptyState (`appraisalShare.invalid*`). Unknown hub id returns `{ok:false}`.

Compare Hubs (`HubCompareCards.tsx`, data `compareHubs` in `appraisalData.ts`): foldable section (caret IconButton, collapsed by default unless entered from Quickbar). One card per hub in fixed `TRADE_HUBS` order (Jita, Amarr, Dodixie, Rens, Hek); system name is a `SystemLink`; Sell total and Buy total figures as compact ISK, tooltip exact, click copies exact ISK to clipboard, 2s "copied" tooltip + sr-only live region. 1 col phone, 3 `sm`, 5 `lg`. No sorting (fixed order). No refine/LP/net in compare. A side with nothing priced is a dash (`buildHubComparison`).

Data source: Fuzzwork station aggregates via `market/prices.ts getHubPrices` (15-min TTL, per-type null fallback; ADR 0002); packaged volume from SDE market types (`loadMarketTypesById`); reprocessing from SDE `loadReprocessing` (1.4 MB, active character only); skills from Dexie `loadCharacterModifiers`; LP from ESI `getCharacterLoyaltyPoints` + public `getLoyaltyStoreOffers` for corps the character holds LP with (`appraisalLpAcquisition.ts`).

Engine (`src/engine/market/appraisal.ts`)

- `buildAppraisal`: price*percent/100 per side, totals skip null sides, `unpricedRows` counts them.
- `appraisalUndercut`: sell price one tick below hub's lowest sell (`priceTick.ts`); null if no seller or at 0.01.
- `appraisalNet` (always 100%): instantNet = sum(buy*qty - sales tax); listNet = undercut value - sales tax - broker fee (Accounting, Broker Relations, standings via `useTradeHubStandings`).
- `refineBeatsSellAsIs`: refine total + leftover units' buy value strictly greater than buy total; ties read sell.
- `lpBeatsMarket`: affordable LP option cheaper than market sell; `engine/market/lpAcquisition.ts` `cheapestLpOffer` picks per-redemption cost (LP + ISK + required-item turn-in at hub prices, never scaled by percent).
- `compareMargin` (spread, spread %, after-fees): used by Compare drawer.

Observed gaps

- Refine and LP columns are on screen but missing from CSV (`appraisalCsv.ts`).
- Shared view has no refine/LP/net and no Compare Hubs; Compare Hubs has no refine/LP either (by design comment, `appraisalShareData.ts`).
- Share needs a Character, Firebase sync and a signed-in session; otherwise the button is disabled with no explanatory tooltip for the no-character/no-sync cases (tooltip only for too-large/saving/failed/copied, `AppraisalPanel.tsx:578`).
- No Region mode on Appraisal (header chips hidden, comment `Market.tsx:134`).
- Compare Hubs cards cannot be sorted or exported (comment `HubCompareCards.tsx` header).
- Paste is held in memory only: lost on reload (no persistence in `useAppraisal`).
- Duplicate-name catalogue entries silently resolve to first type id.

---

### 2. Hauling tab

Route `/market/hauling` (`HaulingPanel.tsx`, 1255 lines). Page header has no hub picker here; its Refresh IconButton is Hauling's own (`onRefreshInfoChange`, disabled unless scan ready, `Market.tsx:838`).

Concept: scan one market category (or Everything) for items cheaper at origin hub than destination hub, price them at Expected Sell Price (what a hauler realistically gets, not the cheapest listing), size to a hold + budget, produce Trip Plan and Multibuy text.

Controls (FilterBar, `HaulingPanel.tsx:750+`)

- From and To hub selects (5 hubs + Any hub; one end only; both Any = EmptyState `bothAny`; same hub = `sameHub` EmptyState). Defaults: From = device default hub, To = Jita (Amarr if From is Jita) (`haulingHubs.ts`). Picking Any on one side forces the other off Any (`pickHaulingHub`).
- Category select: Everything + Ammunition & Charges (default, id 11), Ship Equipment, Drones, Implants & Boosters, Trade Goods, Ship and Module Modifications, Planetary Infrastructure; ships excluded (packaged volume mismatch) (`haulingCategories.ts`).
- Mode select: `list` (list at destination, default) / `instant` (sell into destination buy orders) (`HAUL_MODES`, `haulingData.ts:86`).
- Category and Mode sit in the route row on desktop; below the narrow breakpoint (`useIsNarrow`) they move into the filter sheet and a one-line "category · mode" summary shows under the bar.
- Filters (FilterBar funnel popover on desktop, sheet on narrow; draft model, Apply commits): Sells within (7/14/30 days/any), Margin over (0/3/5/10%), Demand (steady / any); days and demand list mode only (hidden in instant, not counted in the active-filter badge). Fees line shows Accounting/Broker levels (instant shows Accounting only).
- URL params: `from,to,cat,mode,days,margin,demand` (`HAULING_URL_FILTERS`; ADR 0015). days/margin/demand remembered device-local (`haulingFilterPref.ts`, URL wins); mode URL only.
- Data Age badge (desktop only), ColumnPickerMenu (Buy, Expected, Margin, ISK/m3, Days, Bring; Days dropped in instant mode; reset), device-local `haulingColumns`.
- Dismissible intro banner explaining Expected Sell Price (`haulingIntroDismissed`, list mode only).

Trip bar (rendered only when at least one row is shown; not in the loading/error/empty states): select-all checkbox + "N of M selected", Profit and Spend totals, Hold meters (`HaulingHoldMeters.tsx`, one bar per hold, binding-limit text), Cargo space control, Copy Multibuy, overflow menu (`TableActionsMenu`: CSV export, Fill hold = clear overrides (disabled when none), Clear all = untick every row, Show/Hide multibuy list).

Cargo space popover (`HaulingCargoControl.tsx`; Cargo space control and its hint live in the trip bar, so they appear only with rows): tabs Ship (search ship catalogue, base holds), Fitting (saved Fittings, exact holds with skills/expanders via `haulingFittingStats.ts` -> dogma engine, lazy import; "no fittings" hint), Custom (m3 + hold kind: general or one of 9 specialised kinds: commandCenter, mineral, gas, ice, fuel, ammo, planetary, mining, infrastructure, `src/engine/market/cargoHolds.ts`). Ship tab lists the first 30 of "Haulers and Industrial Ships" until searched. Picking closes the popover; the trigger button is primary-styled ("choose a ship") until a cargo is set, then shows label + total m3. Clear removes the cargo and the ISK budget together; spinner while computing; failure text. ISK budget field (optional). Persisted device-local: `haulingCargo`, `haulingBudget` (`haulingCargo.ts`). Without a cargo choice a hint ("choose a ship") replaces the meter; list still works.

Table (`DataTable`, virtualize auto, compact density, dense stacked cards, expandable row detail, `rowContextMenu` = `ItemContextMenu`, `rowMoreActions`): select checkbox, Item (icon + name + flags), Hub (only with Any hub), Buy (origin lowest sell), Expected Sell Price (instant: Buy Order price), Margin % (green at >= 3%, dim below; wide tables add "+X each" suffix), ISK/m3, Days to Sell with demand mark (dot/ring/square: most-days/bursts/rarely; words shown only in wide tables) (list only), Bring (editable numeric box; empty or 0 unticks; tooltip names what limited it). Unticked rows dimmed (opacity-60). Flags per row: crowded, thin, outlier (>=100% margin), low margin (<3%) shown as one warning IconButton next to the name (tap/hover tooltip lists every flag). Instant mode relabels Expected as "Buy order" and uses its own margin tooltip. Row click expands detail (no chevron, `hideIcon`).

- Card layout when table width < 47.5rem (53 with Any hub) or phone; figures compact when < 56rem (60) or phone (`TABLE_WIDTHS`, ADR 0017 stack-by-class).
- Row detail (`HaulingRowDetail.tsx`): list mode groups (1) Expected sell price (recent sale vs undercut, lower of the two; cheapest listing for reference), (2) How fast it sells (per day, units listed ahead, days to sell; region history note), (3) load and margin (buy qty x price, fees indented, profit, margin, max buy price). Beside: destination sell ladder (8 levels, expected price marked), behind a button below `lg`. Instant mode: working lot (buy at origin, sell into buy orders, tax, profit, margin) beside destination buy orders with filled ones shaded. Links: Open in Market (Browser at that hub), route-safety link (SystemLink).
- Footer line: scanned count or hidden counts by reason (thin / slow / low margin).
- States: spinner (`role=status`) with staged progress text (`prices` / `history` / `books`, done/total), error EmptyState with Retry, empty with Reset filters and why rows hidden, Copy toast / copy-failed toast (fallback shows the multibuy `<pre>`).

CSV (`haulingCsv.ts`, surface via `useTableExport`): Item, [Hub], Buy, Expected/Buy order, Margin %, ISK/m3, [Days to sell, Demand], Flags, Bring. Raw numbers; Bring = current plan.

Multibuy: `multibuyText(plan.lines)` -> clipboard; list shown on demand.

Data sources (`haulingData.ts`): pass 1 Fuzzwork aggregates once per hub the lanes touch (`getHubPrices`; list: dest lowest sell >= 1.10x origin lowest sell; instant: dest highest buy >= 1.035x), each item keeps only its best lane (matters with Any hub), top 80 by gap (`MAX_PRICED_CANDIDATES`); pass 2 (list only) ESI destination-region history for all 80 (`loadPriceHistory`): drops items with no recent price/volume or whose recent price x 0.94 / buy < 1.03, shortlist top 40 by that proxy (`MAX_BOOK_CANDIDATES`); instant skips history and takes the top 40 by gap; pass 3 ESI order books for the shortlist at both hub stations (`getOrderBook`, ADR 0003). Prices unavailable at every origin = error state. Fees from active character skills (`useHaulingFees`); no scope required.

Engine

- `haulingMarket.ts` `HAULING_THRESHOLDS`: horizon 7d, own share of demand 25%, min unit margin 5%, history 30d, recent price 7d, mean orders per trading day < 2 = rarely whatever the day count, else >=20 trading days = most days, >=8 = bursts, else rarely (trading day = volume > 0 inside the 30d window); crowded 10 orders within 1%, low margin 3%, suspicious 100%. `estimateSale` = lower of recent sale price and one-tick-under cheapest; `summarizeDemand`; `lotEconomics`.
- `haulingPlan.ts` `planTrip`: unticked rows ship 0, typed quantities are kept and reserve space/budget first; the rest are ranked by profit per share of the scarcest resource (hold space or remaining budget), then each gets min(sales cap, profitable supply, eligible space, remaining budget) in that order; fills specialised holds first (narrowest), spills to general (`cargoHolds.ts holdAccepts`); `limitedBy` names the cap.

Observed gaps

- Category list is hard-coded seven market groups; ships excluded (`haulingCategories.ts` header).
- Both ends Any hub unsupported (v1, 20 lanes would blow request budget, `haulingHubs.ts`).
- Demand read from region-wide history while ladders are hub-station (popover says so); no per-station history in ESI.
- Scan caps (80 priced, 40 with books) mean results are a top-N, not exhaustive; footer reports scanned count only.
- Instant mode drops Days and demand; Days column listed in picker only in list mode.
- Hauling has no Region/System destination, only the 5 Trade Hubs.
- Cargo/budget are device-local, not synced.
- No route-safety info in the table itself; only a link in row detail.

---

### 3. Compare drawer (Compare Set)

Component `CompareDrawer.tsx`, mounted by `Market.tsx:1310` whenever the Compare Set is non-empty, on every Market tab. Fixed-position non-modal bottom drawer (`z-30`, `bottom-16` over mobile nav), handle button "Compare (N)" toggles open/closed; drag handle to resize, ArrowUp/ArrowDown on handle step the height; expand to full-screen sheet (`z-50`) with restore; on narrow screens Clear all moves into the export overflow menu.

Compare Set (`compareSet.ts`): zustand, scratch only (no Dexie, no sync, lost on reload). Items added from Browser item header (Compare IconButton), item context menus, Variations "Compare" (`addMany`, followed by Undo toast `market.compareUndo.*`, `Market.tsx:371`). Views: Prices | Attributes (`SegmentedControl`); `openIn(view)` + counter `openRequest`, consumed once.

Prices view columns: Item (removable icon, MarketItemLink), Best sell, Best buy, Spread, Spread %, After fees, Volume (`market.compare.column*`). Priced at the Browser's `orderBookLocation` (shows "prices from <hub or region>"), refreshes with `refreshTick`. After-fees uses active character's skills + standings (`compareMargin`); null without skills (`marginFor`), with an assumes-base-standings note. CSV via `compareCsv.ts` (surface `market-compare`). Error EmptyState on price load failure.

Attributes view (`CompareAttributesMatrix.tsx`, `useCompareAttributes.ts`, `compareAttributesCsv.ts`): items as columns, dogma attributes as rows grouped by category (collapsible, row counts), synthetic "Worth" row (Estimated price from the order-book summary); "Differences only" checkbox on by default with "N identical hidden"; shared words of item names moved to header corner (`shortCompareLabels`); sticky header + pinned attribute column, sideways scroll beyond ~5 items on phone; no-differences message. Engine `attributeCompareMatrix.ts` (`isUniformRow`), `attributeUnits.ts`, `itemAttributes.ts` (reference-name resolution `attributeReferenceNames.ts`).

Observed gaps

- Compare Set not persisted or synced (header doc).
- No relative best/worst colouring in Attributes (deferred, issue #146 per `attributeCompareMatrix.ts` header).
- Prices view priced at Browser's location only; Hub Compare in Appraisal is a separate mechanism.

---

### 4. Variations tab (Browser item panel)

`VariationsTable.tsx`; tab label "Variations (N)" when rows exist (`Market.tsx:735`). Rows = selected item's Tech/Meta/Faction variation group, or Market Group siblings when none (`variations.ts`, `variationIndex` from catalogue). Default sort Sell ascending. Columns: Name (icon, MarketItemLink-style select), Tier (T1 < T2 < T3 < others alphabetically, `KNOWN_TIER_RANK`), Sell, Buy, "vs this item" (signed compact ISK delta against selected item's own book, `selfSummary`). Prices read per row at `orderBookLocation` (one region even under All regions; scope named "priced at"). Row click selects that item (re-anchors table). Row context menu `ItemContextMenu` includes "Compare Variations". Header button Compare adds all rows + selected item to Compare Set and opens Attributes. CSV (`variationsCsv.ts`) via `TableActionsMenu`. States: per-row loading, "no orders" per side, group count / none-sold line, empty EmptyState `market.variations.none`.
Observed gaps: priced from the same loader as order book, no staleness indicator per row; variation group size uncapped (Undo toast notes ~19 rows add).

---

### 5. Price History tab (Browser item panel)

`PriceHistoryPanel.tsx` + lazy `PriceHistoryChart.tsx` (Recharts, dynamic import keeps it out of initial bundle). Region = resolved region of the order book scope (`Market.tsx:1085`; global-market override for PLEX). Source: ESI `/markets/{region}/history` (`getMarketHistory`), cached via `loadWithCache` until ESI `Expires` (daily rollover); ESI 400 for untradable type cached as empty (`priceHistory.ts`). All ESI fields kept (average, highest, lowest, volume, order_count).

- Range Select 7d/30d/90d/1y (`PRICE_HISTORY_RANGES`), device-local `marketPriceHistoryRange` default 30d (`priceHistoryRangePref.ts`); range only slices the full series. Full-width row on phone.
- Summary strip: Hi, Lo, Median, Volume, Orders/day (`summarizePriceHistory`, `summaryNone` when empty).
- Chart: two stacked synced charts. Price pane: high/low band, average line, moving-average line (7-day window; 3-day on the 7d range, `movingAverageWindowDays`, `PriceHistoryPanel.tsx:28-37`). Volume pane: volume bars + order-count line on a right axis (axis hidden on phone, line stays). One shared legend row (not per chart). Tooltip: date, avg, price range, volume, order count. `role=img` chart label. Moving average computed on the full series, then sliced to the range.
- Day table below chart (`DataTable`: date, average, price range, volume, orders) with `TableActionsMenu` CSV (`priceHistoryCsv.ts`): date (UTC midnight), average, low, high, volume, order count. Range applies to table and CSV.
- States: spinner (loading), error EmptyState (fetch threw; distinct from empty), empty EmptyState (ESI has no history), inline `summaryNone` text when history exists but none in the chosen range (chart still renders).
  Observed gaps: region-wide, not station-scoped (ESI limitation); no export of the moving average; MA window fixed (decision `20260910-091729-price-history-moving-average-window-fixed-7-days`).

---

### 6. Quickbar and price alerts

`QuickbarList.tsx`, `quickbar.ts`, `useQuickbar.ts`. Per-character Editable Data (Dexie `quickbars` table; one record per Character, synced to Firestore `characters/{uid}/quickbars` via `QUICKBARS` in `src/sync/syncedCollections.ts:337`, tombstone-aware merge, never deleted, only emptied), rendered in Browser's left finder column under the tree. Reads as empty with no active character; Add disabled then (tooltip `market.contextMenu.quickbarNoCharacter`).

- Add: pin IconButton in item header (toggles), item context menus; remove: row button or header pin; reorder: dnd-kit drag (pointer + keyboard, `reorderQuickbarItems`); dedupe by typeId.
- Row: grip drag handle (4px pointer activation, keyboard sensor), name button (selects item in Browser; `aria-current` on the open item; selected row highlighted), icon, compact alert target `≥`/`≤` + price when set (`QuickbarList.tsx:92-98`, text not `IskAmount`), bell IconButton (`pressed` when target set) opening the alert popover, danger remove IconButton. No live price on the row.
- Header: title + "View in Appraisal" IconButton (market icon; disabled when empty).
- "View in Appraisal" sends names (qty 1 each) via `quickbarToPasteText` and opens Appraisal with Compare Hubs expanded.
- Empty state text `market.quickbar.empty`.

Price alert (`PriceAlertForm.tsx`, `PriceAlertDialog.tsx`, `ItemPriceAlertBell.tsx`): popover on Quickbar row and Browser header bell, dialog from item context menu. Fields: target price (parsed ISK, rounded to whole ISK on save, validation `invalidPrice`), direction above/below (default above), shows current lowest sell at the Market hub (`useMarketHub`, `getHubPrices` `sellMin`) and hub line; Save / Clear; edits a copy, committed only on Save. Stored as `targetPrice` + `targetDirection` on the `QuickbarItem` (both set or both cleared; `setQuickbarItemTarget`). Bell on an unpinned item pins it with the target (`pinWithTarget`). Alert delivery lives in `src/features/notifications` (alert groups/events); in-app foreground poller only (`priceAlertDomain`, `pollDomains.ts:1596`; compares lowest sell at the Market hub, no scheduled-push projection; Overview Price alerts card reads the poller's last snapshot).
Observed gaps: alerts exist only for pinned items and require an active character; one target per item; Quickbar items carry no quantity.

---

### 7. Page-level paste router

`src/app/GlobalPasteRouter.tsx`, mounted in Layout. Ctrl/Cmd+V anywhere not in a field and with no overlay open: `pasteDestination` (`engine/import/pasteDestination`) classifies the clipboard as an EFT fit (-> `FITTINGS_PATH` with `fittingLoadText`) or an item list (-> `/market/appraisal` with `appraiseText`); anything else is ignored. No confirm step; parsers and catalogue load lazily on first paste. Decisions: `20261001-211035-...`, `20261002-133425-...`.
Observed gaps: no visible hint of the shortcut outside Help shortcuts; a failed classification gives no feedback.

## 5. LP Store

Summary

| Feature                        | Where                                                 | Notes                                                                                                                 |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| LP Store page                  | `/market/lp-store[/:corporationId]`                   | Market subView (`src/app/navDestinations.ts:185-195`), not a MARKET_TABS tab. Own route `src/routes/LoyaltyStore.tsx` |
| Store picker                   | page header, `src/features/loyalty/LpStorePicker.tsx` | Hand-built combobox popover; held-LP corps pinned first with balance                                                  |
| Landing state                  | `/market/lp-store`                                    | Picker + empty state only (`LoyaltyStore.tsx:406`)                                                                    |
| Offers list                    | left panel, `DataTable`                               | Ranked ISK/LP desc; virtualized; select row -> detail                                                                 |
| Offer detail                   | right panel (desktop) / bottom-sheet `Modal` (phone)  | Profit breakdown, View in Market, Plan in Industry, materials table                                                   |
| Filters                        | `FilterBar`                                           | Hub, price basis, affordable-only (default on), blueprints-only, search; all but hub/basis in URL                     |
| Column picker                  | filter bar action                                     | Optional cols `profit`, `iskPerLp`; device-local                                                                      |
| CSV export                     | list panel action + materials table                   | `surface: lp-offers`, `lp-offer-materials`                                                                            |
| LP Value setting               | gear -> `PageSettingsButton` -> `LpValueSettingsForm` | Synced `sync.loyaltyLpValue`; 0 = market rate                                                                         |
| LpStoreLink                    | `src/features/loyalty/LpStoreLink.tsx`                | Icon link used by Appraisal LP column + Blueprint Acquisition modal                                                   |
| Wallet LP rows                 | `src/routes/Wallet.tsx:331,753`                       | Link/row click into the store                                                                                         |
| Legacy `/wallet/loyalty[/:id]` | `src/app/legacyPaths.ts:9`, `src/app/App.tsx:181-182` | `LegacyPathRedirect`; UNGATED (`routeScopes.ts:265,268`)                                                              |

### Nav, route, gating

- Nav: `subViews` of Market (`navDestinations.ts:193`, label `loyaltyStore.title`, palette alias `loyalty.title`). Decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`: shopping an LP store is a market errand; balances stay on Wallet.
- Doc title: `src/app/documentTitle.ts:41-42` keys the new `/market/lp-store` paths; the old `/wallet/loyalty` entries (`:43-44`) remain as dead duplicates.
- Scope: both `/market/lp-store` and `/:corporationId` gated on `getCharacterLoyaltyPoints` (`routeScopes.ts:37-41,262-263`, shared `LP_STORE_REQUIREMENT`). Decision `20260929-224008-lp-store-browsing-keeps-the-loyalty-scope-gate`: browsing a store with 0 LP still works (0 balance), but gate stays; no anonymous browse.
- Data: `GET /loyalty/stores/{corp}/offers/` public (`features/loyalty/store.ts`), cached Dexie global key `loyalty-store-offers:<id>`, `STALE_AFTER.static`, conditional fetch. Corp name `getCorporationPublicInfo`. LP balance `loadCharacterLoyaltyPoints`. Prices from Fuzzwork/hub snapshot via `useMarketSnapshot` (same as Build Plan). Skills via `loadCorrectedSkills`. Corp list for picker: baked `lpCorporations.json` (`loadLpCorporations`).

### Page header

- Title = corp name (or "LP Store"). `DataAgeBadge` of offers fetch. `CorporationLink` (show info). StatChips: Your LP (active character's balance with this corp), Offers shown `n / total`.
- Actions: `LpStorePicker` (w-72, wraps to own line on phone) + settings gear (section `market`).
- Offline banner when offers served from cache (`LoyaltyStore.tsx:852`).
- Remount keyed on corporationId so switching stores drops selection/state.

### Picker (`LpStorePicker.tsx`, `lpStorePickerOptions.ts`)

- Select-styled button opens dialog popover with pinned search; list = every NPC corp running an LP store. Held corps (LP>0) first, desc by balance, shows balance; rest alphabetical. Typed query uses `rankedSearch`; held stay pinned.
- Keys: Arrow/Home/End highlight (`aria-activedescendant`), Enter opens highlighted (or first match if typed), Escape closes + refocus, blur outside closes. Live-region count + "no matches" state. Pick navigates to `/market/lp-store/:id`.
- Decisions: `20260930-144709-select-box-lp-store-picker`, `20260905-114550` (hand-built ARIA).
- Corps with LP but no store (e.g. EverMarks/Paragon) are not listed.

### Filters (FILTER_PARAMS, `LoyaltyStore.tsx:379`)

- Search (item name substring, deferred value), `affordableOnly` (default true, omitted from URL when default; chip shows affordable count), `blueprintsOnly`, `offer` (selected offer id; deep link from BPC Sourcing LP rows opens it; phone opens sheet on arrival).
- Hub select (`TRADE_HUBS`, writes `useMarketHub`, device-local shared with Market) and Price basis select (Sell = list at hub lowest sell; Buy = instant into hub highest buy; `usePriceBasis`, `loyaltyStorePriceBasis`, device-local). `FilterBar` draft model: hub/basis/chips commit together; funnel collapses on phone.
- Reset filters button in no-match empty state (shown when rows exist and search/affordable/blueprints narrow them; clears search, turns Affordable OFF and Blueprints off, `LoyaltyStore.tsx:655-659`). Active-filter badge counts only Affordable and Blueprints.
- `AssumesBaseStandingsNote` shown above list when basis = sell (broker fee standings assumed base; `LoyaltyStore.tsx:669`).

### Offers table

- Columns: Item (identity, never hidden; shows `BP` badge, "LP + ISK" caption), Profit (ISK, net), ISK/LP (1 decimal, bold, tone by sign). Column picker: `profit`, `iskPerLp` (`loyaltyStoreColumns.ts`, key `loyaltyStoreOffersVisibleColumns`; reset available).
- Sort: URL `sort`, default `iskPerLp desc`; sortable cols item/profit/iskPerLp; unpriceable (null) sink last (`rankByIskPerLp`; sortValue undefined). `mobileSort` on phone, `stackSummary` "n offers".
- Row click selects; row context menu = `ItemContextMenu` on the product (blueprint rows target the manufactured product; Build Plan item if blueprint). No three-dot `rowMoreActions` by decision `20260927-144329-lp-store-offers-table-skips-the-row-three` (though `rowMoreActions` prop is present in code, `LoyaltyStore.tsx:689`: see gaps).
- CSV (`loyaltyStoreCsv.ts`): item, LP cost, ISK cost, profit, ISK/LP — all cols regardless of picker; filtered rows; blank for unpriceable. Materials CSV: name, needed, owned, buy cost.
- States: spinner until offers + blueprint catalog + market snapshot all loaded (`ready`); empty store ("emptyTitle"); offers load failed with nothing cached (error EmptyState + Try again); filters hide all ("noMatch" + reset).

### Offer detail (`OfferDetail`)

- Header: product name (+ blueprint name subline). Buttons: View in Market (hub-aware link), Plan in Industry (blueprints with a product; navigates to Industry plans with `product=` and a Blueprint Acquisition price seed from `lpBlueprintPickPrice`; unpriced redemption opens unseeded).
- Big ISK/LP and Net profit; breakdown lines: sell/buy price at hub, store cost (LP + ISK), required items (each priced, or "not priced" warning), materials + job fee (blueprints), net profit.
- Notes: "need N more LP" when unaffordable; warnings when profit null (separate copy for unpriced required item vs unpriced product/material).
- Blueprint offers: "Use my own materials" chip per offer (state local, not persisted; uses detected owned stock), materials `DataTable` (name link, needed, owned, buy cost) + CSV menu.
- Desktop: list + detail `Panel` side by side, `aria-live` announcement on selection; detail shows `selectPrompt` until a row is picked. Phone: row tap opens `Modal placement="sheet"`.

### Engine

- `engine/loyalty/offerProfit.ts`: `profit = revenue - salesTax - brokerFee - iskCost - requiredItemsCost - buildCost`; `iskPerLp = profit/lpCost`; broker fee only on sell basis, once per redemption (100 ISK min per stack); sales tax both bases; fees from `engine/industry/fees.ts`. `affordableLp = playerLp >= lpCost`. Decision `20260914-213119-lp-offer-profit-nets-market-fees-one-redemption`.
- `features/loyalty/offerRows.ts` `computeLoyaltyOfferRows`: blueprint offers via `buildVsBuy` (cost side only, 1 run), plain items at hub price; required items priced at sell side.
- `engine/loyalty/marketLpValue.ts`: market LP Value per corp = median of top-5 offers' ISK/LP with iskPerLp>0 and hub sell volume >= 5 x quantity per redemption (`MIN_DEPTH_REDEMPTIONS`); needs >=3 qualifying else null. `lpRate(own, market)`: own LP Value wins if >0, else market, else null (unpriced, never 0).
- `features/loyalty/marketLpValue.ts`: prices store untrained skills/no standing (rate errs low), remembered 15 min per corp+hub. `lpRates.ts` `loadLpRates` feeds Blueprint Acquisition (`features/industry/blueprintPurchaseOffers.ts`) and implant purchase (`features/fittings/implantPurchase.ts`); other consumers unverified. Decision `20261002-222635-lp-value-defaults-to-each-stores-market-rate`.
- `engine/market/lpAcquisition.ts`: Appraisal's LP alternative — redemptions needed for pasted qty, total LP/ISK, affordable flag; ISK not scaled by Price Percent (`features/market/appraisalLpAcquisition.ts`).
- Standing: offers carry no home station, so standing resolved against the configured hub (`useLoyaltyStoreOffers.ts:58-62`, issue #1238).

### Observed gaps (LP Store)

- A failed offers load (ESI down, nothing cached) shows an error state with Try again (`loadLoyaltyStoreOffersStatus`, `offersError`), not the "empty store" copy.
- `useUrlParams` has no hub/basis in URL; shared links do not carry price basis.
- Offers table passes `rowMoreActions` (`LoyaltyStore.tsx:689`) although decision `20260927-144329` says not to; verify intent.
- `documentTitle.ts` still carries dead `/wallet/loyalty` entries beside the new `/market/lp-store` ones.
- Required-item prices and materials always priced at sell side even on Buy basis (`priceBasis.ts` doc); not surfaced in UI.
- "Use my own materials" per-offer state is not persisted or in the URL.
- No `loading` retry/stale indicator for market snapshot; spinner only.
- Picker silently swallows corp-list/balance load failures (`.catch(() => {})`).
- No bulk/compare across stores; page ranks within one store only.

---

## 6. Contract search (Item search + Courier tabs)

Summary

| Feature                 | Where                                                                                 | Notes                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item search tab         | `/contracts/search/items` (`CONTRACTS_TABS` id `search/items`, `src/app/pageTabs.ts`) | `ContractSearchPanel mode=items`; public item_exchange/auction lines, any item type                                                                                 |
| Courier tab             | `/contracts/search/courier`                                                           | `CourierResults` in same panel; public courier contracts as hauls                                                                                                   |
| Mode memory             | `contractSearchModePref.ts` key `contractSearchMode`                                  | Bare `/contracts` lands on last-used mode; Search/History choice not persisted                                                                                      |
| Freshness + Refresh     | page header (`routes/Contracts.tsx`)                                                  | Status reported up via `onStatusChange`; Refresh reloads both snapshots                                                                                             |
| Item filters            | `ContractSearchFilterBar`                                                             | type query, region, max price, min qty, sale kind, exclude auctions/PLEX, jump range, current system                                                                |
| Type suggestions        | panel under bar                                                                       | click pins `items.type`; shows offer count + cheapest                                                                                                               |
| Summary chips           | when a type pinned                                                                    | Offers / Cheapest / Median + Clear item                                                                                                                             |
| Items columns           | picker `contractSearchItemsVisibleColumns`                                            | qty, price, system, jumps, region, expires (+ identity Item)                                                                                                        |
| Contract detail (items) | `PublicContractDetailModal`                                                           | Region, system, location, expires, contract id copy, contents (you receive / hand over)                                                                             |
| Row context menu        | Build Plan menu                                                                       | `BuildPlanContextMenu` seeded from offer row (`seedFromOfferRow`)                                                                                                   |
| Items CSV               | `contract-search`                                                                     | `contractSearchCsv.ts`                                                                                                                                              |
| Courier filters         | `CourierFilterBar`                                                                    | route text, origin/dest region, From my region, dest space chips, min reward, max collateral, max volume, min days, over-rate, hide uncompletable, route preference |
| Courier columns         | picker `courierVisibleColumns`                                                        | reward, collateral, jumps, ISK/jump, ISK/m3, expires (+ identity Route)                                                                                             |
| Courier detail          | `CourierContractDetailModal`                                                          | route path, reverse lane, going-rate benchmark, community floor, risks, figures                                                                                     |
| Courier CSV             | `courier-contracts`                                                                   | `courierContractsCsv.ts`                                                                                                                                            |
| Phone lane groups       | `DataTable groupBy`                                                                   | Collapsed lane headers with best ISK/jump + risk markers                                                                                                            |

### How tabs mount (`src/routes/Contracts.tsx`)

- `CONTRACTS_TABS`: `search/items` (default), `search/courier`, `history` (skipped here). Tab ids are full path suffixes (`pageTabs.ts` comment). `/contracts/search` alone redirects to Item search.
- Search is switched outside the history chain (`Contracts.tsx:601`): needs no character contracts or `contracts` scope; `/contracts` route is UNGATED (`routeScopes.ts:230`), History tab gates `getCharacterContracts` per tab with its own `GrantBanner` (decisions `20260912-200442-contracts-is-ungated-its-scope-is-gated-per`, `20260912-200030-contracts-opens-on-search-not-history`).
- Selecting a search tab writes the mode pref (`Contracts.tsx:367`).

### Data source

- ADR `docs/adr/0013`: scheduled Cloud Function `syncPublicContractOffers` (every 30 min, `functions/src/index.ts:639`) fetches EVE Ref public-contracts dataset, writes wholesale-replaced chunked Firestore snapshots (3000 rows/chunk, `PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE` in `functions/src/publicContracts.ts:377`; the ADR's ~2000 is stale; + `meta`). Client reads `publicContractOffers` (all item lines, `publicContractOffers.ts`, cache key `publicContractOffersAll`) and `publicCourierContracts` (`publicCourierContracts.ts`, single chunk, <620 rows) via `chunkedSnapshot.ts`; Dexie-cached, stale after 30 min, `useRouteSnapshot` with `staleWhileRevalidate` (#963). Decisions: `20260912-032407-generalized-public-contract-snapshot-schema-and-sizing`, `20260912-050724-contract-search-reads-the-shared-snapshot-as-its`, `20260912-055542-courier-contracts-get-a-sibling-snapshot-not-more`, `20260912-065131-courier-contracts-are-a-sibling-mode-of-contract`, `20260912-160012-each-contract-search-board-loads-on-its-own`.
- Guarded by `isSyncConfigured()`: build with no sync backend shows `notConfigured` empty state, reads nothing.
- Needs an active character (cache keyed by character): `Contracts.tsx:550` redirects to `/characters` when none is active (after a hydration spinner), so the panel's own spinner (`ContractSearchPanel.tsx:943`, `!hydrated || activeCharacterId === null`) is only a hydration state in practice. That spinner is checked before `isSyncConfigured()`, so `notConfigured` appears only after hydration. No ESI scope for search itself. Per-contract detail items fetched live (public ESI contract items) in modal.
- Name resolution fills behind boards (`contractSearchNames.ts`: type names, region names; `offerLocations.ts`: station/structure system lookup; `courierEndpoints.ts`: NPC stations from `stations.json`, structures left unresolved to avoid 403 fan-out).

### Item search tab

- Filter bar (`ContractSearchFilterBar`, `FilterBar` funnel; all filter state in URL, prefix `items.`: q, region, maxPrice, minQty, kind, hideAuctions, hidePlex, jumps, type): search box sits in the bar itself (type text; free text widens to many types, pinned type narrows to exactly one), Region (`RegionSelect`), Max price (`IskInput`), Min quantity, sale kind chips (exchange/auction toggle), Exclude CheckboxSelect (hide auctions, hide PLEX asks with tooltip), Jump range (`JumpRangeSelect`) + `CurrentSystemPicker` (writes own setting immediately, not part of the Apply draft; origin for distances), active-filter count; `JumpRangeNote` under the bar explains a range with no origin. Bar actions: ColumnPickerMenu + TableActionsMenu (CSV).
- Suggestions list (when typing; max-h-72 scroll): per type, offer count and cheapest; click -> `selectType`. Summary chips (Offers, Cheapest, Median) + "Clear item" button show once a type is pinned. No-match EmptyState's Reset filters clears every field. Spinner "naming types" while names resolve and typed query non-empty.
- Price semantic: asking price rule `offerAskingPrice` (auction shows buyout vs starting bid; PLEX asks converted via `usePlexPrice`, shown as "ISK + PLEX"; unpriced offers (zero price, multi-type unknowable) marked and sorted last; decisions `20260915-102046-zero-price-contract-treated-as-unpriceable...`, `20260915-093419-multi-type-contract-price-treated-as-unknowable...`).
- Table: virtualized `DataTable`, default sort `price asc` (URL `items.sort`), `rowMoreActions`, mobile stack with affixes (qty, jumps, expires), `stackSummary` offer count. Columns: Item (name plain text; row opens modal), Qty, Price, System (+security), Jumps (via local route; hint when unavailable), Region, Expires (user timezone).
- Row click -> `PublicContractDetailModal` (title item name; stat chips price/qty and ME/TE/runs for blueprints; region/system link/location/expires/contract id with copy button; contents grouped "You receive" / "You hand over" when contract asks items; empty "no longer listed" if contract gone; load-failed state).
- CSV: item, qty, price (asking), PLEX, system, jumps, region, expires ISO. Exports all filtered rows.
- States: loading spinner per mode; load error; empty snapshot ("emptyTitle/Hint"); filter-no-match with Reset filters; revalidating note; offline/refresh-failed banner (`activeResult.fromCache`).
- Engine: `engine/contracts/contractSearch.ts` filter (type set, region, max price, min qty, kind, hideAuctions, hidePlexRequests, plexPrice); auction without buyout passes max-price (unknowable passes); `contractOffers.ts` BPC/BPO narrowing is for BPC Sourcing, not this tab. Decision `20260926-004049-public-contract-search-and-bpc-sourcing-virtualize-instead`.

### Courier tab (`CourierResults.tsx`)

- Filters (URL prefix `courier.`, remembered default via `useRememberedUrlParams` + `courierFilterPref.ts` key `contractSearchCourierFilter`): route text (matches endpoint station/system names), Origin region, Destination region (options limited to regions present), "From my region" button (resolves via `esi-location` -> `solarSystems.json`; quiet disabled states: location unavailable / no hauls from region), Destination space chips (only bands present; unplaced destination excluded when narrowed, with explanatory empty state), Min reward, Max collateral, Max volume (m3), Min days to complete (missing deadline passes), Over-rate (all/only/hide), Hide uncompletable chip (player-structure/no-gate-route), Route preference select (shortest/safer etc.; absent = Travel default from Settings > Travel; `courier.pref`; not counted in the active-filter badge). Route text (`courier.q`) and `courier.pref` are not remembered with the other filters.
- Columns: Route (identity: origin -> destination systems + security + risk markers), Reward, Collateral, Jumps (`JumpsLink` to Travel), ISK/jump, ISK/m3, Expires. Volume and days are filters/modal figures, not columns. Default sort `iskPerJump desc`. Jumps computed in one batched local pass (`localJumpCountsForRoutes`) honoring route preference; states pending/known/unknown (snapshot unavailable note).
- Phone: lane-grouped (`groupBy laneKey`), collapsed by default; header = lane, haul count, regions, best ISK/jump, risk markers; `stackLayout="dense"`, `mobileSort`, summary "hauls / lanes".
- CSV: pickup, origin region, drop-off, dest region, reward, collateral, volume, jumps, ISK/jump, ISK/m3, expires.
- Detail modal (`CourierContractDetailModal`): reward on delivery, ISK/jump line (same-system span variant), pick-up and drop-off (system links, security, player-structure label), jump count + route path (chokepoint markers), reverse lane count + "search reverse lane" (swaps origin/dest filters, closes modal), going-rate benchmark (multiple of corpus median), community floor reward (collateral/1B x jumps x 1M) and share, risk flags list (player structure, no gate route, nullsec, gank chokepoint, over-rate, high collateral), no-collateral and once-accepted notes, freighter volume note, route exposure (systems at <=0.5 sec along route, computed on open only), expires in hours, collateral (ratio to reward), volume (+ISK/m3), time to deliver, listing expiry, contract id.
- Engine: `courierRates.ts`: `iskPerJump = reward / max(jumps,1)`; `iskPerVolume`; `courierGoingRate.ts`: median ISK/jump of corpus, needs >=20 samples, "far above" at multiple >=8; `courierRisk.ts`: risks per endpoint, `blocksCompletion` for structure/no-gate; high-collateral flag at ratio setting (`collateralThreshold.ts`, synced `sync.courierHighCollateralRatio`, presets 20/50/100/200, default 50); `courierReverseLane.ts` counts placeable return hauls; `routeExposure.ts`. Decisions: `20260912-141100-courier-hauls-rank-on-isk-per-jump-and`, `20260912-143620-isk-per-m3-is-the-courier-boards-secondary`, `20260912-165245-courier-hauls-carry-endpoint-space-not-route-safety`, `20260912-172628-courier-risk-flags-state-a-condition-never-a`, `20260912-191729-reverse-lane-counts-placeable-return-hauls-only`, `20260922-141611-courier-endpoints-show-system-security-not-the-space`, `20260925-234907-high-collateral-courier-flag-modal-only-at-50x`, `20260926-195118-three-more-settings-defaults-courier-collateral-multiple-bpc`.

### Observed gaps (contract search)

- Search needs an active character even though it needs no scope; with none, `Contracts.tsx:550` sends the user to `/characters` (no sign-in-free browse).
- Courier endpoints that are player structures stay unnamed (raw id); "unknown" destination excluded when a space band is narrowed (explained only in empty state).
- Courier volume/days not sortable (not columns).
- Item search table has no bulk action or "seed Build Plan" for all lines (only per-row context menu; decision `20260911-...` all-or-nothing seeds are BPC Sourcing).
- High-collateral flag is modal-only by decision, not in table rows.
- Collateral threshold setting lives in settings (`sync.courierHighCollateralRatio`); no control on the Courier tab itself.
- Both boards depend on a single backend snapshot (30 min, EVE Ref); no live ESI fallback, and unsynced builds show `notConfigured`.
- Mode pref remembers items/courier only; filters not remembered for items (courier filters are).

## 7. Persistence and sync matrix (verified)

| State                                                                                                                                               | Where                                                                    | Synced to Firestore              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| Quickbar items + alert targets                                                                                                                      | Dexie `quickbars`                                                        | Yes (`syncedCollections.ts:337`) |
| LP Value (`sync.loyaltyLpValue`), courier collateral ratio (`sync.courierHighCollateralRatio`)                                                      | settings                                                                 | Yes                              |
| Appraisal share snapshot                                                                                                                            | Firestore `share` doc, 7-day TTL (`shareStore.ts:23`)                    | Yes (written on Share)           |
| Public contract/courier snapshots                                                                                                                   | Firestore (Cloud Function written), Dexie-cached                         | Read only                        |
| Hub, Location Mode, Price Percent, column pickers, Hauling cargo/budget/filters, price-history range, LP price basis, contract mode, courier filter | device-local (localStorage/Dexie settings)                               | No                               |
| Browser filters/tabs, Orders/History/Transactions filters, Hauling lane, LP filters, contract filters                                               | URL params (ADR 0015)                                                    | No                               |
| Compare Set, Appraisal paste, LP "own materials" chip                                                                                               | memory only                                                              | No                               |
| Open-orders problem samples                                                                                                                         | Dexie, rolling 7 d                                                       | No                               |
| Order book                                                                                                                                          | memory 300 s; Fuzzwork hub prices 15 min memory + Dexie (`prices.ts:26`) | No                               |

Scope matrix: Browser, Variations, Compare, Price History, Appraisal, Hauling = no scope (skills/standings/LP enrich when granted, absent otherwise). Orders + History = `esi-markets.read_character_orders.v1`; Transactions = `esi-wallet.read_character_wallet.v1`; both panel-level `GrantBanner`. Structure competition = optional `esi-markets.structure_markets.v1` (row shows "unavailable"). LP Store = loyalty scope, page-level gate (`routeScopes.ts:262`). Contract search = none; History tab needs contracts scope. Fill/undercut alerts = `getCharacterOrders` scope.

## 8. Interview Q&A

1. Why does the Browser read ESI order books while Appraisal and Hauling use Fuzzwork? ADR 0003 vs 0002. Browser needs per-order depth, distance, security, player structures; Fuzzwork gives only station aggregates, fast and one request for many types, which suits pricing a pile (`Market.tsx` header, `prices.ts:26` 15 min TTL).
2. How is the order book cached and fanned out? 300 s memory TTL, concurrent callers coalesced, manual refresh bypasses (`orderBook.ts:9`). All regions/range fans out at concurrency 4 (`orderBook.ts:18`), only regions with in-range systems; per-region failures counted, partial book shown.
3. What is the bait flag? Sell price >= 10x best sell is flagged, never hidden (`orderBookDepth.ts:51`). Hidden outliers would misstate depth; flag keeps truth.
4. How does a legal undercut price get computed? Tick = 4 significant figures at the price's magnitude, min 0.01 ISK (`priceTick.ts:44`, tickCents at :32); `undercutPrice` one tick below, `outbidPrice` one above. Used by Appraisal sell list, Open orders Copy new price.
5. Which problem wins when an order has several? Fixed precedence belowFloor > undercutStation > undercutSystem > undercutRegion > expiringOrStale > outbid > healthy (`orderProblems.ts:39`). Buy orders never belowFloor; buy undercuts become outbid. Scopes nest station -> system -> region; unchecked scope is "not checked", not clear.
6. How is "frequently undercut" decided? Local samples: >50% undercut among samples in 7 d, min 12 samples, 4 min spacing, 512 cap per order (`orderProblemHistory.ts:50-63`). Only on otherwise healthy rows. Samples are device-local, only accrue while the tab polls.
7. How is realized margin computed and why can it be blank? FIFO over own wallet buys; margin = sale total - lot cost - sales tax (`realizedMargin.ts:39`). Blank when journal lacks the tax line, units outran wallet buys, or buys predate history. Broker fees excluded.
8. Hauling thresholds? List mode: destination lowest sell >= 1.10x origin; instant: dest highest buy >= 1.035x (`haulingData.ts:56,64`); 80 priced candidates, 40 with books (`:65-66`). Expected Sell = lower of recent (7 d) sale price and one tick under cheapest; own share of demand 25%, horizon 7 d, min unit margin 5%, crowded = 10 orders within 1%, low margin <3%, suspicious >=100% (`haulingMarket.ts:65-76`). Why Expected not cheapest: scam/bait listings and thin demand; decisions `20260926-161750`, `20261004-233720`.
9. How does trip planning choose quantities? min(sales cap, profitable supply, space, budget); overrides pin or untick; specialised holds filled first, spill to general (`engine/market/haulingPlan.ts`, `engine/market/cargoHolds.ts`); `limitedBy` names the binding cap.
10. Price History moving average? Trailing SMA of daily average, window 7 days (3 on 7d range), computed on the full series then sliced so range start is not under-averaged; shorter series return empty (`engine/market/priceHistory.ts:110`; decision `20260910-091729`). Region-wide; ESI has no station history.
11. How does LP Store rank offers? profit = revenue - sales tax - broker fee (sell basis only, once per redemption) - ISK cost - required items - build cost; ISK/LP = profit/LP cost; null (unpriceable) sinks last (`engine/loyalty/offerProfit.ts`). Market LP Value = median of top-5 ISK/LP offers with sell volume >= 5 redemptions, needs >=3 offers (`marketLpValue.ts:20-37`); own LP Value wins if >0.
12. Why does contract search work without a contracts scope? Public contracts come from a shared Firestore snapshot synced every 30 min by a Cloud Function (ADR 0013; staleness 30 min, `publicContractOffers.ts:34`), so no per-user ESI. It still needs an active character (cache keyed by character; none = redirect to `/characters`) and a sync backend.
13. Courier ranking and flags? ISK/jump = reward / max(jumps,1); going rate = corpus median needing >=20 samples, "far above" at >=8x (`courierGoingRate.ts:31,71`); community floor = collateral/1B x jumps x 1M (`:87`); high collateral flag default 50x ratio, modal only.
14. Why is the Quickbar per character and synced but Compare Set not? Quickbar is Editable Data with a synced collection (`syncedCollections.ts:337`); Compare is deliberately scratch (`compareSet.ts`).
15. Why does `/market` stay ungated? Browser needs no scope; gating the page would hide it for everyone. Orders/History/Transactions banner themselves (`routeScopes.ts:57`).
16. What does Share store and for how long? Priced items only (max 1000, `appraisalSnapshot.ts:18`), 7-day Firestore TTL, same pile reuses same link; view is rebuilt at stored prices without refine/LP/net since those depend on the sharer's character.

## 9. Observed gaps (cross-cutting)

- Doc-vs-code: summary rows above that say "cross-device sync not verified" for Quickbar were wrong; fixed.
- Orders/History/Transactions read only through active-character redirect; no all-character History or Transactions.
- No live prices on Quickbar rows; alerts only for pinned items.
- Appraisal paste lost on reload; refine/LP omitted from CSV and share.
- LP Store: hub/basis not in URL.
- Contract search needs an active Character: with none the page redirects to `/characters` (`Contracts.tsx:550`), no anonymous browse.
- Hauling scan is top-N (80/40), hubs only, hard-coded categories.
- Price History and Hauling demand are region-wide, not station-level.
- Dead `/wallet/loyalty` keys left in `documentTitle.ts`, stale phone-day-list comment in `TransactionsPanel.tsx`, `orderSoFarNotBuilt` placeholder in Order Detail.
- Not re-verified: Compare Attributes engine internals. Open orders panel, Quickbar, Appraisal, Hauling and Order Detail line cites re-checked 2026-10-06.

## 10. Improvement ideas

- Persist Appraisal paste (session) and include refine/LP columns in CSV.
- Quickbar: show live best price per row from the Fuzzwork hub snapshot, with alert-hit highlighting.
- LP Store: hub/basis in URL for shareable links.
- Contract search: sign-in-free path (cache key not tied to character); today it redirects to `/characters`.
- Hauling: station-level history when ESI allows, user-selectable category groups, show scan coverage ("top 80 of N").
- Open orders: slot usage line (`orderSlots.ts` exists), price-alert action on rows, filter/copy-location in row menu.
- Notifications: add expiring/under-floor events from the feasibility note.
- Surface `fillTime.ts` in History.
