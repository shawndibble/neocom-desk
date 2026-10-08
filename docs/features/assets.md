# Assets — feature inventory

Route `/assets` and `/assets/:stationId/*` (`src/routes/Assets.tsx`, 2.2k lines). Economy nav group, mobile tab (`src/app/navDestinations.ts:205`). Not a tabbed page (not in `PAGE_TABS`): depth is drill-down in the URL path. Read-only, cached for offline. Terms per `CONTEXT.md`: **Quickbar**, **Compare Set**, **Station Pin**, **Jump Basis**, **BPO/BPC**, **Character filter**.

Corp assets (`/corp/assets`, `routes/CorpAssets.tsx`) reuse the same row components and tree engine; pointer only, see end.

## Summary

| Feature                                                    | Where                                       | Notes                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location list (root `/assets`)                             | `Assets.tsx:1118-1190`                      | one row per location; pinned first, unresolved last                                                                                                                                            |
| Drill-down (`/assets/<locationId>/<seg>/…`)                | `engine/assetPath.ts`                       | station → ship/container/bay → items; Back + breadcrumb                                                                                                                                        |
| Search (`?q=`)                                             | `Assets.tsx:683`                            | name substring, flattens to result list, across all locations                                                                                                                                  |
| "All items" flat view (`?all=1`)                           | `Assets.tsx:1627`                           | every item, sortable, no drill-down                                                                                                                                                            |
| Min-value filter (`?min=`)                                 | `Assets.tsx:1742-1750`                      | flat views only; ISK shorthand accepted                                                                                                                                                        |
| Flat sort (Name/Value/Quantity)                            | `assetSortPreference.ts`                    | device-local                                                                                                                                                                                   |
| Location sort (Name/Value/Item count/Jumps away)           | `stationSortPreference.ts`                  | device-local; pins always first                                                                                                                                                                |
| Open for one Character (`?char=<id>`, alias `?chars=<id>`) | `Assets.tsx`                                | Shows that Character's assets with a "Name only" readout and, from the Wallet chart, a ‹ Wallet crumb; the active Character is not switched. A Character without the scope gets its grant note |
| Cross-character search (`?chars=`)                         | `Assets.tsx:719-798`                        | This/All Characters; only while a search is active                                                                                                                                             |
| Station Pins                                               | `stationPins.ts`, `LocationRow`             | 3-state cycle, synced Editable Data                                                                                                                                                            |
| Jumps away + security                                      | `Assets.tsx:1237-1466`                      | lazy, bounded to pinned/visible/open locations                                                                                                                                                 |
| Route preference select                                    | `Assets.tsx:1905`                           | this-view override of Travel default                                                                                                                                                           |
| Select mode + bulk actions                                 | `Assets.tsx:1658`                           | Quickbar, Compare, copy names, select all                                                                                                                                                      |
| Item context menu                                          | `features/market/ItemContextMenu.tsx`       | right-click / long-press / More actions                                                                                                                                                        |
| Item name link                                             | `assetBrowserRows.tsx` `ItemRow`            | name → Show info (Item Detail)                                                                                                                                                                 |
| Value estimates + totals                                   | `engine/assetTree.ts`                       | average price; BPC from contract listings                                                                                                                                                      |
| BPO/BPC badge                                              | `assetBrowserRows.tsx:134-148`              | blueprint stacks                                                                                                                                                                               |
| Open in Fittings                                           | `Assets.tsx:1841-1855`                      | shown on a ship level                                                                                                                                                                          |
| CSV/XLSX/copy export                                       | `assetsCsv.ts`                              | active Character, search-matched only                                                                                                                                                          |
| Re-login, offline, truncated, stale-link states            | `Assets.tsx:1691-1722,1939`                 |                                                                                                                                                                                                |
| Command Palette "Assets" group                             | `features/commandPalette/assetsProvider.ts` | item → `/assets?q=`                                                                                                                                                                            |

## Route, nav, gating

- Nav: `/assets`, `group: 'economy'`, `gating: 'scope'`, `mobileTab: true`.
- `/assets` and `/assets/*` gate on a scope bundle (`src/app/routeScopes.ts:178,193`): `getCharacterAssets`, `getUniverseStation`, `getUniverseSystem`, `postUniverseNames`, `getUniverseType`, `getUniverseGroup` with `strings: 'assets'`. `getCharacterLocation` is deliberately not required (jumps degrade).
- Redirect: no active Character → `/characters` (`Assets.tsx:1565`).
- Back: browser Back steps up one level (path is state). Level heading receives focus on drill/back (`useFocusHeading`, issue #1485). List scroll resets to top on level change.
- URL query kept across every drill-down link (`assetHref`).
- Query params (ADR 0015): `q` (search text), `all` (bool), `min` (text), `chars` (Character filter codec, default from synced Settings default-character-filter). Verified garbage values fall back to default (`Assets.test.tsx:1822`).

## Data sources and scopes

| Data                               | Loader                                                                                                           | Source                                                                                                                                  | Scope                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Assets                             | `features/character/assets.ts` `loadCharacterAssets`                                                             | `getCharacterAssets`, X-Pages, capped at `MAX_ASSET_PAGES = 25` (`esi/endpoints.ts:595`)                                                | `esi-assets.read_assets.v1`                               |
| Type names                         | `features/character/typeNames.ts`                                                                                | local SDE `types.json`, then batched `postUniverseNames`, per-id `getUniverseType` on a batch 404                                       | public                                                    |
| Type volumes (m³)                  | `loadTypeVolumes`                                                                                                | SDE snapshot only, never live                                                                                                           | none                                                      |
| NPC station names                  | `features/character/stations.ts`                                                                                 | SDE `stations.json`; ESI only if snapshot unreadable                                                                                    | public                                                    |
| Structure names / systems          | `features/character/structures.ts`                                                                               | `getUniverseStructure` (ACL-checked, 403 is normal not re-login; names shared across the roster)                                        | `esi-universe.read_structures.v1`                         |
| Solar-system names, security       | `systemSecurity.ts`                                                                                              | local/public                                                                                                                            | none                                                      |
| Orphan parent names                | `loadStructureName` for a `location_type:item` parent with no row (e.g. personal-hangar division in a structure) | same                                                                                                                                    | same                                                      |
| Prices                             | `market/prices.ts` `getAveragePriceByType`                                                                       | ESI public market prices (`average_price`), stale copy shown at once, outage → badges 0                                                 | public                                                    |
| BPC values                         | `features/character/assetCopyValues.ts`                                                                          | Public Contract Offers snapshot (Firestore, via dynamic import) + owner's blueprint records for ME/TE/runs (decision `20260930-120122`) | `esi-characters.read_blueprints.v1` optional; best-effort |
| Blueprint type set (BPO badge)     | `useBlueprintTypeIds`                                                                                            | SDE `blueprints.json`; only loads if a name ends " Blueprint"/" Formula"                                                                | none                                                      |
| Character location (jumps)         | `features/character/location.ts`                                                                                 | `getCharacterLocation`, once per page load per Character                                                                                | `esi-location.read_location.v1` (optional)                |
| Station pins                       | Dexie `stationPins`, synced                                                                                      | local + sync                                                                                                                            | none                                                      |
| Build plans (material menu action) | Dexie `buildPlans`                                                                                               | local                                                                                                                                   | none                                                      |

- Cache key `assets` (`assets.ts:14`). Snapshot loads rows first and publishes progressively: assets, then names, volumes, location names, prices, BPC values behind (`loadAssetsSnapshot`, `Assets.tsx:273`).
- Other Characters' assets: `loadOtherCharactersAssets` (cache-or-live per Character, concurrency capped, a failing/ungranted Character is skipped, not fatal). Cached per resolved id set within the page visit (`crossCharacterCacheRef`).
- `ItemRow`/structure names for other Characters resolve under the owning Character's ACL.

## Page layout

`PageHeader` title "Assets":

- Meta: `DataAgeBadge` (assets fetch), the Character filter control (`CharacterFilterControl`, size md; hidden for one-Character accounts), small spinner "Searching other characters…" while cross-character data loads.
- Actions (right): **All items** toggle (`FlatList` icon, pressed state), **Select** toggle (select mode), `TableActionsMenu` (export), **Refresh**.
- Below: `SearchInput` "Search items…" — only shown when assets are loaded and no re-login needed. Debounced 250 ms for matching; input stays instant.
- Select-mode bar (when on) between search and list.
- List panel fills the viewport height (`h-[calc(100dvh-…)]`); only the list scrolls (virtualized with TanStack Virtual, overscan 10, measured heights because rows wrap on phones).

## Location list (root)

Level header: "N locations · <total value> ISK" (total chip hidden when drilled in, in flat mode, or empty; says "(filtered)" when the Character filter narrows below every Character). Controls:

- **Sort** select: Name, Value, Item count, Jumps away. Device-local (`assetsStationSort`). Pinned locations always sort first; the field orders within each group (`compareStations`). Jumps away: unknown sorts last.
- **Route** select (Travel route preferences): override for this view only; opens on the pilot's Travel default. Changes jumps counts (every Travel rule is in the key), not persisted.
- Ghost grant note (`GrantNote`) when location scope not granted: "Jumps away unavailable … Grant Character details".

Sections (headings): `Pinned`, `All locations · N` (only when something is pinned), `Location unresolved · N` (warning tone) for orphan groups.

`LocationRow`: whole row is a link (min 64px) into the location. Shows security value (colour per `securityStatusColor`, number always printed), jumps-away text (opens the route when known, `PlaceJumpsLink`), item count, ISK value (isk-pos tone, `IskAmount`), caret. A **pin** `IconButton` beside the link (`aria-pressed`), cycles unpinned → this character → all characters → unpinned (`nextPinState`). Pin icon fills and takes accent colour when pinned. Orphan rows show a container icon, no pin, no security/jumps, hint "Not among this character's own assets — likely inside a container you don't own (e.g. a corp hangar)".

In select mode each location row has a tri-state checkbox ("Select all items at <station>").

Location labels (`locationLabel`): station name; structure name or "Structure #id"; "In space (<system>)"; container parent by its resolved type name; fallback "Container".

## Drill-down

Path `/assets/<locationId>/<seg>/<seg>…`, segments `i:<item_id>` or `b:<bay>` (`assetNodeSegment`). Stable across re-sorts and refetch.

- Level header: Back `IconButton` ("Back one level"), `h2` current name (sr-only item count suffix), breadcrumb of ancestor links (`›` separated), on a location: security + jumps-away, and on any non-leaf: "N items · ISK" aggregate. Ship level adds **Open in Fittings** button (`assetShipEditLocation`: builds a Fitting Share Code from the ship as it sits, slots/charges/drones/fighters/cargo; null if too large).
- Rows by node kind:
  - `ContainerRow` (ship, container, bay): link one level deeper, folder icon, name (`h3` if named entity, plain for bays), "N items · ISK" badge, caret. Bays (Cargo Hold, Drone Bay, Fitting) are synthesized for ships and kept in fixed order; other siblings sort by name.
  - `ItemRow` (leaf): name link, BPO/BPC badge, owner-Character badge (only for other Characters' items), ×quantity, unit volume m³ ("-" if unknown), ISK value, row menu slot.
- md+: label strip above item rows (Name, Qty, m³, Value; sticky; shown only on a level that has item rows). Below md: name then one wrapping metadata line (`ItemRow` comment).
- Empty level: "Nothing stored here." Stale/unknown segment: "This location is gone" with **Back to all locations** (resolution never throws or silently lands on root, `resolveAssetPath`).
- Orphan groups (assets whose parent is not in the fetch) become top-level groups.
- Cycles in the asset chain are absorbed (`buildNode` ancestors guard).

## Search

- Text box matches the resolved type name (case-insensitive substring). While active the page leaves the tree and shows a flat result list across every location.
- Header: "N matches" (plural), min-value input, sort select, clear (X) button. Empty: "No items match your search."
- `SearchResultRow`: whole row links to the root location the item lives in (`rootStationIdFor`, query kept). Shows name, BPO/BPC badge, owner badge, ×quantity, security, trail of ancestors ("Station › Ship › Container"), ISK value, caret. Name is plain text (a Show info button would nest a control in the link); the menu is not on search rows.
- Cross-character: when the Character filter resolves to more than the active Character **and** a search is active, other Characters' assets are merged in (item ids are globally unique) with a Character badge. Note under the count: "CSV export only includes this character's own items." (`assets.crossCharacterCsvNote`).
- Anti-flash: no results shown during the debounce window (`Assets.tsx:1090`).

## "All items" flat view

Toggle (`?all=1`). Same flat list as search with every item across every location, no query. Same min-value, sort, rows as search. Persists in the URL only.

## Min value and sorts (flat views)

- **Minimum value** `IskInput` (accepts shorthand like `10m`; echo hidden), `?min=`. Held off (0) while prices still load (`pricesReady`), so rows are not hidden by a zero price. Never remembered (decision in `assetSortPreference.ts` comment: a filter that hides assets must not persist).
- **Sort** select: Name (asc), Value (high first), Quantity (high first). Remembered per device (`assetsItemSort`).

## Value model (`engine/assetTree.ts`)

- Stack value = quantity × average price of the type; blueprint copies value from contract listings via `copyValueByItemId`, 0 if no listing (never the original's price).
- Container/ship/location totals aggregate descendants (`sumNodes`); bays own nothing themselves.
- Value shows `IskAmount` (whole ISK; long-press reveals exact per DESIGN).
- Prices are average traded price, not market buy/sell.

## Select mode and bulk actions

- Toggle off clears the selection. Checkboxes (tri-state; checking a node cascades to every descendant item id; `assetSelection.ts`) on location, container and item rows.
- Bar: "N items selected" (when >0), **Select all in view** (every leaf in the rows currently on screen: results, a level's children, or whole locations at root), **Deselect all** (disabled when none), and when >0: **Add to Quickbar** (disabled without active Character; schedules sync), **Add to Compare** (Compare Set, no sync), **Copy names** (newline-separated to clipboard).
- Bulk acts on merged assets, so items from other Characters selected in cross-character search are included in Quickbar/Compare/Copy.

## Item context menu (`ItemContextMenu`, shared across the app)

Triggers: right-click, touch long-press, Shift+F10, or the row's visible **More actions** button (WCAG 2.1.1, `RowMoreActions`). The name link keeps right-click for the menu (not the browser's). A touch hold-lift guard stops the link following (`useLiftAfterHoldGuard`).

Entries: Add to Quickbar (disabled with reason if no Character), Price alert (opens `PriceAlertDialog`), Show info, Add to Compare, View in Market (keeps page region/hub), Copy name, Build Plan (disabled "checking…" or "no blueprint options"; for a blueprint row plans the product it builds, `planProductTypeID`), View in Industry as material (only when one of the Character's own Build Plans consumes it), PI Plan (only when the type is PI-plannable), and an "Export table ▸" submenu (the export context via `TableExportProvider`).

Blueprint catalog loads lazily on first menu open (`usePageItemActions({lazyBlueprints:true})`).

Item name link: `ItemInfoLink` → opens Show info (`?info=type-<id>` modal, `features/entities/ItemInfoModal.tsx`, lazy `ItemDetailModal`). Documented elsewhere (Market).

## Export

`TableActionsMenu` in header, menu items CSV / Excel / copy-for-Sheets. Not a `DataTable`, so uses a lazy `TableExport` (`getRows` builds only on export, `Assets.tsx:1523`). Rows: active Character's own assets matching the current search text, grouped by location label (sorted) then name (sorted). Columns: Location, Item, Quantity (`assetsCsv.ts`). `truncated` flag passed when the fetch hit the page cap.

## States

- Hydrating: spinner; no active Character: redirect.
- Loading: spinner. `assetsNeedsReauth`: `GrantBanner` "Log in again to see your assets" for `getCharacterAssets`. Error: "Couldn't load" empty state. No data: "No assets cached / Couldn't load this character's assets yet. Try again shortly."
- Offline (`fromCache`): warning "offline" line.
- Truncated: "Incomplete — Only the first N assets were fetched — this character has more." + **Try again**.
- Prices unreachable: page still renders cached assets, badges 0 (`Assets.test.tsx:639`).
- Unresolved locations: raw `Station #id` / `Structure #id`; orphan group heading.

## Mobile behaviour

- Rows wrap to a name + one metadata line; no fixed-width columns below md, no horizontal scroll; item figures become table cells only at md+.
- Back button steps up a drill level; level header shows a Back `IconButton`.
- Security/jumps in the drilled header hidden below `sm`; item count too (aggregate value stays).
- Character filter trigger icon-only below md; page height accounts for the bottom nav.
- Touch: long-press opens row menu; More actions button always visible.

## Related

- Command Palette: "Assets" group lists every owned type once (summed across Characters, cache-only, no request) → `/assets?q=<name>` (adds `chars=all` if an alt holds it, `assetsProvider.ts:78`).
- Industry Build Plans read all Characters' assets for owned stock (`loadAllCharactersAssets`, `assets.ts`); Fittings reads asset ships.
- Corp assets `/corp/assets` (`routes/CorpAssets.tsx`, `engine/corp/assetDivisions.ts`): division-first; `LocationRow` hides pin there (`showPin`). Pointer only.

## Observed gaps (facts from code)

- CSV export always covers the whole account's active Character matching the search text only; ignores the current drill level, All-items view, min-value filter, sort and cross-character results.
- Search rows have no item menu or Show info (row is one link); only drill-down item rows do.
- Cross-character reach is search-only: with a Character filter set but no search, browsing and totals are the active Character's alone, except the total-value chip is flagged "(filtered)".
- No filter by item group/category, ship vs module, or by location type; no column sorts on drill-down levels (name-sorted only, bays first).
- Value is average price only, 0 for an item with no price entry; no buy/sell basis choice. Volume is SDE-only, shows "-" for types outside the slim snapshot.
- Assets fetch capped at 25 pages (`MAX_ASSET_PAGES`); beyond that the list is partial with a retry notice.
- Asset total value chip only on the root location list.
- Jumps away resolved only for pinned, visible and open locations (bounded fan-out), so off-screen rows have none until scrolled in; unresolved without the location scope.
- No page-specific keyboard shortcuts documented in Help › Shortcuts; select mode is click/tap only.
- Help/FAQ say nothing specific about Assets beyond the stored-data list.

## Persistence and sync

| State                                          | Where                                                                                              | Synced                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Drill path                                     | URL `/assets/<id>/<seg>…`                                                                          | no                                                                                       |
| Search, All items, min value, Character filter | `?q`, `?all`, `?min`, `?chars` (ADR `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`) | no                                                                                       |
| Location sort                                  | device-local `assetsStationSort`                                                                   | no                                                                                       |
| Item (flat) sort                               | device-local `assetsItemSort`                                                                      | no                                                                                       |
| Route override                                 | component state only                                                                               | no                                                                                       |
| Select mode, selection                         | component state only (cleared on toggle off)                                                       | no                                                                                       |
| Station Pins                                   | Dexie `stationPins` (scope `character` or `account`)                                               | **synced** Editable Data; an account pin from any Character elevates the station for all |
| Quickbar adds                                  | Dexie quickbar                                                                                     | synced                                                                                   |
| Compare Set adds                               | memory store                                                                                       | no                                                                                       |
| Assets, names, prices                          | Dexie ESI cache; per Character                                                                     | no                                                                                       |

## Decisions (why)

- Jumps away on locations, bounded fan-out: `docs/context/decisions/20260831-230742-jumps-away-ships-for-the-assets-page-distinct.md`.
- Item columns at item rows only: `20260926-203503-assets-item-columns-ship-at-item-rows-only.md`.
- BPC value from contract listings (0 without a listing): `20260930-120122-asset-value-prices-blueprint-copies-from-contract-listings.md`.
- Corp assets reuse the engine: `20260903-162701-corp-assets-are-registered-and-assets-gets-no.md`, `20260910-152158`.
- Character filter placement: `20260908-192806`.
- Use-assets in Build Plans (readers of the same assets): `20261003-203239-use-all-fills-every-row-its-use-assets.md`.
- Drill-down in the URL so Back steps up: `src/engine/assetPath.ts:1-14`.

## Formulas and edge cases

- Stack value `assetStackValue` = `quantity × average_price[type]`; blueprint copy = `copyValueByItemId[item_id] ?? 0`; unknown price = 0 (`engine/assetTree.ts:145-152`).
- Node value/count: items count `quantity`; container/ship count `asset.quantity + descendants`; bay owns nothing (`engine/assetTree.ts:162-175`).
- Ship bays: `location_flag` `Cargo` → Cargo Hold, `DroneBay` → Drone Bay, `/^(Hi|Med|Lo|Rig|SubSystem|Service)Slot\d+$/` → Fitting; a node is a ship when any child has a bay flag; bay order fixed Cargo, Drone, Fitting (`engine/assetTree.ts:98-130`).
- Location sort `compareStations`: pinned first (either scope), then name (localeCompare), value desc, item count desc, jumps asc with unknown last.
- Flat sort: name asc, value desc, quantity desc, using precomputed values.
- Min value threshold 0 while `pricesReady` false; parsed with `parseIskAmount` (shorthand).
- Orphan group = `location_type:item` whose parent has no row and no resolved name (`isUnresolvedParent`).
- Cross-character active only when `otherCharacterIds.length>0 && searchActive` (`Assets.tsx:797`).
- Fetch cap 25 pages (`MAX_ASSET_PAGES`), 1000 per page by ESI → partial list flagged `truncated`.
- Search debounce 250 ms; virtualizer overscan 10.
- Blueprint kind: `is_blueprint_copy` → BPC; unflagged blueprint typeID → BPO once the type set is known, never before (`blueprintKind.ts`).
- Pin cycle: unpinned → character → account → unpinned (`stationPins.ts:15-19`).

## Test-covered behaviours (`src/routes/Assets.test.tsx`)

Root list and drill-in; total value chip (#1617); focus to heading (#1485); system/container/structure labelling; orphans; search across locations; offline; truncation + retry; re-login; jumps-away note (#1590); virtualization (#86); sibling sort; ship bays; stale link; pins (cycle, sort, scoping, account-wide); Show info link; BPO badge; item menu actions (Quickbar, Market, Industry as material); All-items; min value incl. shorthand (#2227); flat sort remembered; URL state (garbage fallback, drops defaults, query kept through drill); cross-character (no reach until All, badge, cache reuse, CSV note, CSV scope); jumps-away cases; route preference; location sort remembered; select mode (cascade, bulk Quickbar/Compare/copy, select all in view, deselect).

## Interview Q&A

1. **Why is Assets drill-down in the URL?** Back on a phone steps up a level, links and refresh land in place. `src/engine/assetPath.ts:1-14`.
2. **What happens to a bookmarked path whose container is gone?** `resolveAssetPath` reports unresolved segments; page shows "This location is gone" with a button, never silently the root. `assetPath.ts:85-100`, `Assets.tsx:1941`.
3. **How is an item's ISK value computed?** Quantity × ESI average price; BPCs from contract listings or 0; so totals are rough, not market buy/sell. `engine/assetTree.ts:145`, `market/prices.ts:396`.
4. **Why can a location show "Location unresolved"?** Asset parent not in the fetched list and not resolvable as a structure (e.g. corp hangar). Row hint explains. `Assets.tsx:633`, `assetBrowserRows.tsx` `LocationRow`.
5. **Why are jump counts blank for some rows?** Computed only for pinned, visible and open locations; needs location scope for the origin; unplaceable destinations say why in a tooltip. `Assets.tsx:1278-1293`, `assets.jumpsAway.unknownReason`.
6. **How do pins work across Characters?** Cycle character → account; account pin from any Character wins; character pin only for that Character; synced. `stationPins.ts`, `Assets.tsx:810-825`.
7. **How does cross-character search avoid refetching?** Cache by sorted id set in a ref; per-Character cache-or-live with skip on failure; only runs while searching. `Assets.tsx:760-798`, `assets.ts:fanOutCharacterAssets`.
8. **Why does CSV export ignore the drill level and min value?** Export builds location-grouped rows from the active Character's whole list matching the search text only. `Assets.tsx:865-891,1523`.
9. **How is a BPO distinguished from a BPC?** ESI flags copies; originals are blueprint typeIDs from SDE; badge appears only once the set loads. `engine/blueprintKind.ts`.
10. **Why is the min-value filter not remembered while sort is?** A filter that hides assets reopened silently looks like lost items. `assetSortPreference.ts:13-17`.
11. **What does Open in Fittings do?** Encodes the ship as it sits (slots, charges, drones, fighters, cargo) as a Fitting Share Code and opens the editor; absent if too large. `features/fittings/assetShipLocation.ts`.
12. **Which scopes does Assets need vs. optionally use?** Required: assets (plus public names); optional: location (jumps), structures (structure names), blueprints (BPC values), contacts none. `routeScopes.ts:178-192`, `registry.ts`.
13. **Why structure names resolve under the owning Character?** ACL is per Character; a name resolved for one is mirrored roster-wide. `features/character/structures.ts:1-50`.

## Improvement ideas

- Include drill level / min value / sort in export, or name the scope in the menu.
- Item menu or Show info on search result rows.
- Filters by category/group, ship vs module, location type.
- Totals chip when drilled in plus per-Character split under All.
- Choose price basis (average vs Jita sell/buy) for value; flag items with no price.
- Show a volume total per location (m³ already loaded) for hauling.
- Optional jumps for every location with a background queue and a rate budget.
- Keyboard shortcuts for select mode and search focus.

## Item Detail (Show info) as reached from Assets, fully specified

`entities-share.md` says Item Detail contents are specified in `market.md`, but `market.md` only mentions the modal; this is the canonical spec. Host and URL mechanics (`?info=type-<id>`, entity-link policy, allowlist test) are in `docs/features/entities-share.md` (section "Item Detail host"). Code: `src/features/market/ItemDetailModal.tsx` (640 lines), host `src/features/entities/ItemInfoModal.tsx:22-69`.

Entry points from Assets: item row name link (`ItemInfoLink`, `assetBrowserRows.tsx:390` `ItemRow`), item menu "Show info" (`ItemContextMenu.tsx:153`, `ShowInfoMenuItem`). Not from search rows (plain link). From Contracts: every item line name (`ItemInfoLink`) in the three detail modals. From Wallet: journal market-line name (`JournalDescriptionCell.tsx`).

Behaviour:

- Mounted only while open; mounting is the open signal (`ItemDetailModal.tsx:124`). The app-level host (`ItemInfoModal`) is used from Assets/Wallet/Contracts, so Item Detail opens over the page via URL `?info=type-<id>`; Back closes it (`closeOnBack` is true only when no `onLeave`, `:245`). A link that leaves the modal (Open in Market, price figure, Used-in menu) replaces the history entry and calls `onLeave`, not `onClose`, to avoid racing the link (`:92-97`).
- Header: item name, **Open in Market** button (only when `showOpenInMarket`, which `ItemInfoModal` sets, `ItemInfoModal.tsx:61`; the Market Browser itself omits it). Link target `marketItemUrl(typeId, search)` keeps the page's hub/region query.
- Body (all live except local SDE bits): icon 64px, packaged **volume** (m³), **Best sell / Best buy** figures, description (`EveMarkupText`).
  - Data: `getUniverseType(typeId)` (public ESI, `:193`) plus attribute dictionary (`loadAttributeDictionary`, SDE), PI data, skill modifiers, skill list (each of the last three `.catch` to empty so they cost features, not the modal).
  - Prices: `loadOrderBookView(typeId, priceLocation)` (`:173`). Location = `location` prop (Market Browser passes its own) else the saved Location Mode and Trade Hub via `useSavedOrderBookLocation` (`orderBookView.ts:287`); null until hub, mode and global-market overrides all hydrate so the book is not fetched twice. A failed fetch hides the price line (state `error`) but not the modal; loading shows "…"; an empty side shows "—". Real price is a link into the Market Browser; shorthand with exact on long press (`IskAmount`, `marketIskDecimals`).
  - Required skills (`RequiredSkillsSection.tsx:20`): each required skill with trained status; Add to Plan button (`TargetPlanPicker`, label "Create plan and add" when the Character has no plan); no Character → name + level only. Trained levels are queue-corrected (`loadCorrectedSkills`, `skipQueueWithoutScope`, `:156`).
  - Planetary production (`:605`): for a P1+ commodity, schematic inputs, cycle time and yield; for P0 a line "an extractor pulls it off the planet"; nothing for other items.
  - Used in (`UsedInSection.tsx`): every product whose blueprint or reaction formula consumes the item (local blueprint catalog, not ESI); pages of `USED_IN_PAGE = 50` with Show more; filter box appears above 10 rows (`FILTER_THRESHOLD`); each row has the full item menu and More actions.
  - Attributes: grouped by category via `groupItemAttributes` (skill-requirement rows omitted because Required Skills owns them, `:217`); an attribute a trained/required skill modifies (`findModifyingSkills`, `:336`, only with a Character) becomes a popover button: per-level effect, current level effect (`postPercentMagnitude`) or "untrained", and Add to Plan for level+1 (max 5).
- States: spinner; ESI failure → "error" empty state (`market.itemDetail.errorTitle`) but **Used in still renders** because it is local SDE (`:260-266`); no attributes → "No attributes" text.
- Permissions: no scope needed. A Character is optional (skills, plans).
- Persistence: none of its own; price location from device-local hub and location mode settings (shared with Market); Add to Plan writes a Skill Plan (synced).

Interview Qs: **Why does Show info keep working offline?** It does not fully: type data and prices need ESI; Used-in and PI do (SDE). `ItemDetailModal.tsx:260-266`. **Which price does it show?** Best sell/buy from the Order Book at the saved hub/region, not the average price Assets values with. `:142,173`. **Why does Open in Market not show on the Market page?** It would link to the page already open. `:129,248`.

## Corp assets: the shared surface (`/corp/assets`)

Full spec in `docs/features/corp.md` section 4. What it shares with Assets and where it differs (all verified in code):

- Shared: `ItemRow`, `ContainerRow`, `LocationRow`, `SectionHeading` (`assetBrowserRows.tsx`), tree engine `engine/assetTree.ts` (`buildAssetGroups`, `assetTree.ts:292-381`), `ItemContextMenu`, selection helpers (`assetSelection.ts`), CSV shape (Location, Item, Quantity), 250 ms search debounce, URL `q`, virtualized rows.
- Different: top level is a group (hangar division or special flag) not a station, via `engine/corp/assetDivisions.ts` and `engine/corp/assetPath.ts`; `LocationRow` is rendered with `showPin={false}` and no security/jumps (`CorpAssets.tsx:805-818`); no cross-character merge, no All-items toggle, no min-value filter, no route/jumps selects (`CorpAssets.tsx:20-30` header comment); item menu has `blueprintTypeID={null}` so Build Plan is permanently "No blueprint options" and the blueprint catalog never loads (`:29`); blueprint copy values only if `canReadBlueprints`.
- Gating: `canReadAssets` capability (Director) hides the destination when absent (`navDestinations.ts:141`, `CorpDenied`). Scope `esi-assets.read_corporation_assets.v1` + divisions scope (`corp.md` access model). Route `UNGATED` with capability gate instead (`routeScopes.ts:156-165`).
- Decision: `20260903-162701-corp-assets-are-registered-and-assets-gets-no`, `20260903-212133-corp-assets-division-first`, `20260910-152158-corp-assets-rejoin-the-shared-tree-engine-via`.
