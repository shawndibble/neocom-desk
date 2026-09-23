import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParam } from '@/lib/useUrlState';
import { enumParam, type UrlParamCodec } from '@/lib/urlState';
import { MARKET_TABS } from '@/app/pageTabs';
import {
  Button,
  Caret,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  TypeIcon,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  loadMarketGroups,
  loadMarketTypes,
  loadNpcStations,
  loadSolarSystems,
  loadMarketRegions,
  loadVariations,
} from '@/sde/loadMarketSde';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
  VariationData,
} from '@/sde/marketTypes';
import { buildVariationIndex } from '@/engine/market/variations';
import { TRADE_HUBS, DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { useLocationMode, type LocationMode } from '@/features/market/locationMode';
import { JUMP_RANGES, DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { useCurrentSystem, useJumpRangeFilter } from '@/features/route/currentSystem';
import {
  JumpRangeSelect,
  CurrentSystemPicker,
  JumpRangeNote,
} from '@/features/route/JumpRangeControls';
import {
  filterMarketTree,
  addAncestors,
  MARKET_TREE_MATCH_LIMIT,
  MARKET_TREE_MIN_QUERY_LENGTH,
} from '@/features/market/marketTree';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from '@/features/market/orderBook';
import {
  buildOrderBookView,
  clearOrderBookViewCache,
  fetchOrderBook,
  loadOrderBookView,
  orderBookLocationFor,
  useGlobalMarketOverrides,
  type OrderBookFetch,
  type OrderBookLocation,
} from '@/features/market/orderBookView';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { formatVolume } from '@/features/market/format';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { CompareDrawer } from '@/features/market/CompareDrawer';
import { useCompareSet } from '@/features/market/compareSet';
import { QuickbarList } from '@/features/market/QuickbarList';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { getVariationRows } from '@/features/market/variations';
import { VariationsTable } from '@/features/market/VariationsTable';
import { VariationsCompareModal } from '@/features/market/VariationsCompareModal';
import {
  quickbarToPasteText,
  removeQuickbarItem,
  reorderQuickbarItems,
} from '@/features/market/quickbar';
import { useQuickbar } from '@/features/market/useQuickbar';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
  type OrderBookSummary,
} from '@/engine/market/orderBook';
import { resolveOrderBookRegion, type GlobalMarketOverride } from '@/engine/market/locationMode';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import {
  parseMarketParams,
  buildMarketParams,
  resolveAgainstCatalogue,
  resolveMarketLocation,
  type MarketLocationParam,
} from '@/engine/market/urlState';
import type { RegionOrder } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';
import type { MarketFocusSearchState } from '@/lib/shortcuts';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { downloadCsv } from '@/lib/downloadCsv';
import { orderBookCsvColumns, rangeLabel } from '@/features/market/orderBookCsv';
import { OpenOrdersPanel } from '@/features/market/OpenOrdersPanel';
import { OrderHistoryPanel } from '@/features/market/OrderHistoryPanel';
import { TransactionsPanel } from '@/features/market/TransactionsPanel';
import { AppraisalPanel } from '@/features/market/AppraisalPanel';
import { useAppraisal } from '@/features/market/useAppraisal';
import { useMarketPricePercent } from '@/features/market/pricePercent';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';

/** Rows shown per side before "show all" (CONTEXT.md). */
const ROW_CAP = 15;

/**
 * The page's own top-level tabs: Market Browser plus a character's Open
 * orders and History — previously the separate `/orders` route (open +
 * history) and Wallet's Transactions tab. Distinct from `itemTab` below,
 * which is the *selected item's* own Market Data / Price History split and
 * has nothing to do with this.
 *
 * `history` and `history/transactions` are one tab wearing two hats: both are
 * the character's past, they overlap on item and side, and they answer the
 * same question from either end — which orders ended, and which fills paid
 * out. So History is the tab, and the view is picked from a select in the
 * table's own header (`HistoryViewSelect`) rather than a second row of tabs
 * (round 54). `history/transactions` is still its own `MARKET_TABS` entry —
 * a tab id containing a literal `/` (`docs/ARCHITECTURE.md` §9) — so it gets
 * a real, distinct, bookmarkable path without either needing a second row of
 * tabs or teaching the shared tab foundation about subtabs.
 */
type MarketTab = (typeof MARKET_TABS.tabs)[number]['id'];

function isHistoryView(tab: MarketTab): tab is 'history' | 'history/transactions' {
  return tab === 'history' || tab === 'history/transactions';
}

/**
 * The two sections quoted at a Trade Hub, and so the two that share the page
 * header's hub picker and refresh button.
 *
 * Appraisal deliberately does *not* get the **Location Mode** chips beside
 * them. Fuzzwork's aggregates — the appraisal's price source — are per
 * station, so a Region appraisal would mean one paginated ESI order-book call
 * per pasted line. A control drawn on a tab where it cannot do anything is
 * worse than one that is not there, so the chips stay with the Browser.
 */
function usesHubPicker(tab: MarketTab): boolean {
  return tab === 'browser' || tab === 'appraisal';
}

/** `stationFilter` (:591 originally), URL-backed: a positive location id, or `null`. */
const STATION_FILTER_PARAM: UrlParamCodec<number | null> = {
  parse: (raw) => (raw !== null && /^\d+$/.test(raw) ? Number(raw) : null),
  serialize: (value) => (value === null ? null : String(value)),
};

const ITEM_TAB_PARAM = enumParam(['orders', 'history'] as const, 'orders');

/** Jump Range's distance select, URL-backed like the rest of the Browser's filters. */
const JUMP_RANGE_PARAM = enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE);
/**
 * Deliberately not `textParam()`: its built-in debounce only smooths the
 * *write*, not the render (the tree already re-filters on every keystroke via
 * the hook's own optimistic `pending` state) — and on this page, an
 * item/hub/region change is a second, independent `useUrlParams` writer
 * (`navigateTo`) that can land in the same window as a still-pending debounced
 * write and silently drop it. Writing immediately removes that race; nothing
 * here needed the debounce for its own sake.
 */
const BROWSER_SEARCH_PARAM: UrlParamCodec<string> = {
  parse: (raw) => raw ?? '',
  serialize: (value) => (value === '' ? null : value),
};

/**
 * Stands in for variationIndex before variations.json resolves (or if it
 * fails to load) — every lookup against it comes back empty, which
 * getVariationRows already treats the same as "this item has no variation
 * data" and degrades to the Market Group sibling fallback. Keeps the
 * Variations panel's own data source independent of the page's primary
 * catalogue load.
 */
const EMPTY_VARIATION_INDEX = buildVariationIndex({}, {});

/** Stand-in until globalMarkets.json settles; the order book waits for the real one. */
const NO_GLOBAL_MARKETS: ReadonlyMap<number, GlobalMarketOverride> = new Map();

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

interface LocationCellProps {
  order: RegionOrder;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  t: Translate;
}

function LocationCell({ order, npcStations, solarSystems, t }: LocationCellProps) {
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  // Station name alone. The system and its security used to trail it, but an
  // EVE station name already carries its system ("Jita IV - Moon 4 - ..."),
  // so the suffix repeated a word the eye had just read on every row of the
  // book. The full form survives where it is pasted or exported rather than
  // scanned — `OrderRowContextMenu`'s copy action and `orderBookCsv`.
  return <span>{location.stationName ?? t('market.unknownStructure')}</span>;
}

interface MarketGroupTreeProps {
  groups: readonly MarketGroupNode[];
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  filterResult: ReturnType<typeof filterMarketTree>;
  expandedIds: ReadonlySet<number>;
  searchCollapsedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onSelect: (typeId: number) => void;
  selectedTypeId: number | null;
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

function MarketGroupTree({
  childrenByParent,
  typesByGroup,
  filterResult,
  expandedIds,
  searchCollapsedIds,
  onToggle,
  onSelect,
  selectedTypeId,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: MarketGroupTreeProps) {
  const filtering = filterResult !== null;

  function renderGroup(group: MarketGroupNode, depth: number) {
    if (filtering && !filterResult.visibleGroupIds.has(group.id)) return null;
    const children = childrenByParent.get(group.id) ?? [];
    const items = filtering
      ? (filterResult.matchedTypesByGroup.get(group.id) ?? [])
      : group.hasTypes
        ? (typesByGroup.get(group.id) ?? [])
        : [];
    // Matched branches default open (marketTree.ts), but that default is just
    // a starting point: `onToggle` below lets the user collapse/re-expand any
    // group while search is active, independent of which items still match.
    // Search only ever prunes *items*, never forces expand state.
    const expanded = filtering ? !searchCollapsedIds.has(group.id) : expandedIds.has(group.id);
    const expandable = children.length > 0 || items.length > 0;

    // `min-h-11 md:min-h-0` gives a thumb the 44px floor on the leaf row and
    // on an expandable header — a disabled header is inert, so it stays dense
    // rather than spending 44px of the phone's scrollport on nothing (55 of
    // the catalogue's groups are childless and itemless, five in a row under
    // ECCM alone). Not `controlHeightClassName.md`: its `md:h-9` would grow
    // desktop's 24px rows too, which this fix must not do.
    return (
      <li key={group.id}>
        <button
          type="button"
          disabled={!expandable}
          onClick={() => onToggle(group.id)}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
          className={`flex w-full items-center gap-1.5 py-1 text-left text-xs text-text hover:text-accent disabled:hover:text-text ${
            expandable ? 'min-h-11 md:min-h-0' : ''
          }`}
        >
          {expandable && <Caret expanded={expanded} />}
          <span className={expandable ? '' : 'pl-3'}>{group.name}</span>
        </button>
        {expanded && (children.length > 0 || items.length > 0) && (
          <ul>
            {children.map((child) => renderGroup(child, depth + 1))}
            {items.map((item) => {
              const blueprintTypeID =
                blueprintCatalog === null
                  ? undefined
                  : (blueprintCatalog.byProductTypeID.get(item.typeId)?.blueprintTypeID ?? null);
              return (
                <li key={item.typeId}>
                  <ItemContextMenu
                    typeId={item.typeId}
                    itemName={item.name}
                    blueprintTypeID={blueprintTypeID}
                    onAddToQuickbar={onAddToQuickbar}
                    quickbarAvailable={quickbarAvailable}
                    onShowInfo={onShowInfo}
                    onOpenChange={(open) => {
                      if (open) onRequestBlueprintCatalog();
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.typeId)}
                      style={{ paddingLeft: `${(depth + 1) * 0.75 + 0.75}rem` }}
                      aria-current={selectedTypeId === item.typeId ? 'true' : undefined}
                      className={`flex min-h-11 w-full items-center gap-1.5 truncate py-1 text-left text-xs hover:text-accent md:min-h-0 ${
                        selectedTypeId === item.typeId ? 'text-accent' : 'text-text-dim'
                      }`}
                    >
                      <TypeIcon typeId={item.typeId} size={32} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  </ItemContextMenu>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenByParent.get(null) ?? [];
  return (
    // Flat cap, not viewport-relative: `QuickbarList` renders below this
    // tree in the same column, so sizing the tree to all remaining viewport
    // height would push the quickbar off-screen.
    <ul className="max-h-[32rem] overflow-y-auto">{roots.map((root) => renderGroup(root, 0))}</ul>
  );
}

/**
 * Market Browser: find an item (search + Market Group tree, left) and see its
 * live Order Book at the current Location Mode's region (right), read from
 * ESI (ADR 0003). Location Mode (CONTEXT.md round 9) is either Trade Hub
 * (that hub's region, filtered to its station) or Region (the whole region,
 * every station) — a device-local preference like the hub setting it
 * replaces as the sole location control. A globally-traded item (PLEX today)
 * overrides either mode: its own Global Market Region always wins (round
 * 12). The catalogue (groups/types/systems/stations/regions) is lazy-loaded,
 * not precached (CONTEXT.md round 10) — most installs never open /market.
 */
export function Market() {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = usePageTab(MARKET_TABS);
  // Issue #726: true only immediately after the Quickbar's "View in
  // Appraisal" action, so the panel mounts with its Compare Hubs section
  // already open instead of collapsed.
  const [expandCompareOnAppraisal, setExpandCompareOnAppraisal] = useState(false);
  // `expandCompare` defaults false so every ordinary tab switch clears it —
  // only `handleViewQuickbarInAppraisal` passes `true`, and only that call's
  // own value should reach the next `AppraisalPanel` mount.
  function changeTab(next: MarketTab, expandCompare = false) {
    setTab(next);
    setExpandCompareOnAppraisal(expandCompare);
  }
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  // The Appraisal tab's other half of the same control pair as the hub above.
  const pricePercent = useMarketPricePercent((state) => state.value);
  const hydratePricePercent = useMarketPricePercent((state) => state.hydrate);
  const setPricePercent = useMarketPricePercent((state) => state.setValue);

  const compareCount = useCompareSet((state) => state.items.length);

  const locationModeValue = useLocationMode((state) => state.value);
  const locationModeHydrated = useLocationMode((state) => state.hydrated);
  const hydrateLocationMode = useLocationMode((state) => state.hydrate);
  const setLocationModeValue = useLocationMode((state) => state.setValue);

  // The Quickbar (CONTEXT.md): Editable Data, one record per character. Reads
  // as [] rather than requiring an active character — Market Browser itself
  // needs none — so Add to Quickbar silently no-ops with nobody active.
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const {
    items: quickbarItems,
    write: writeQuickbar,
    add: handleAddToQuickbar,
    setTarget: handleSetQuickbarTarget,
  } = useQuickbar(activeCharacterId);

  function handleRemoveFromQuickbar(typeId: number) {
    void writeQuickbar(removeQuickbarItem(quickbarItems, typeId));
  }
  function handleReorderQuickbar(activeTypeId: number, overTypeId: number) {
    void writeQuickbar(reorderQuickbarItems(quickbarItems, activeTypeId, overTypeId));
  }

  // Issue #726: sends the Quickbar's contents into Appraisal, landing
  // directly on the multi-hub view (#689) rather than a collapsed one.
  function handleViewQuickbarInAppraisal() {
    appraisal.appraiseText(quickbarToPasteText(quickbarItems));
    changeTab('appraisal', true);
  }

  // Item Detail (CONTEXT.md round 6): opened from the item context menu
  // (tree/search/Quickbar) or an order row's context menu, both of which
  // only know the target item, not the whole selection state.
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );
  function handleShowInfo(typeId: number, itemName: string) {
    setInfoModalItem({ typeId, itemName });
  }

  // Variations "Compare" (issue #146): every row currently shown in the
  // Variations table, side by side — see VariationsCompareModal.
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
  const [marketRegions, setMarketRegions] = useState<MarketRegionEntry[] | null>(null);
  // Loaded on its own, not with the catalogue below: the order book waits
  // only on this (never on the whole SDE catalogue), and a failed read
  // settles to no overrides rather than leaving the book waiting forever.
  const globalMarkets = useGlobalMarketOverrides();
  const [variationData, setVariationData] = useState<VariationData | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);

  // Blueprint catalog for the item context menu's Build Plan action, loaded
  // lazily on the first menu open rather than on mount — it pulls the full
  // SDE types.json, and CONTEXT.md keeps /market's own payloads out of the
  // install precache because most installs never open this page at all.
  const [blueprintCatalog, setBlueprintCatalog] = useState<BlueprintCatalog | null>(null);
  const blueprintCatalogRequested = useRef(false);
  function ensureBlueprintCatalog() {
    if (blueprintCatalogRequested.current) return;
    blueprintCatalogRequested.current = true;
    void loadBlueprintCatalog()
      .then(setBlueprintCatalog)
      .catch(() => {
        // Build Plan action degrades to "No blueprint options" on failure — not core functionality.
      });
  }

  // Tree search, in the URL (ADR 0015) scoped to the Browser tab — a reload
  // or a shared link reopens the same search rather than an empty tree.
  const [query, setQuery] = useUrlParam('browser.q', BROWSER_SEARCH_PARAM);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(new Set());
  // Groups the user has explicitly collapsed while a search is filtering the
  // tree (see MarketGroupTree's `expanded` calc) — kept apart from
  // `expandedIds` (the plain-browsing expand state) so clearing the search
  // returns to whatever the tree looked like before it started.
  const [searchCollapsedIds, setSearchCollapsedIds] = useState<ReadonlySet<number>>(new Set());

  // Narrow screens show one column at a time (CONTEXT.md round 8); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const isDesktop = useIsDesktop();

  // The selected item and the current location are read from the URL
  // (CONTEXT.md round 7, issue #4), not held in component state: the query
  // string is the single source of truth, so a shared link and the browser's
  // own back/forward both just work. A parsed id that doesn't (yet, or ever)
  // resolve against the loaded catalogue falls back to the default view
  // rather than erroring — `types`/`marketRegions` still being null (first
  // load) is treated as "not yet known to be invalid", not "invalid".
  const parsedParams = useMemo(
    () => parseMarketParams((key) => searchParams.get(key)),
    [searchParams]
  );

  // Cross-page item links (MarketItemLink, ImplantChip, ItemContextMenu's
  // "View in Market") now land on `/market/browser?type=...` directly
  // (`engine/market/urlState.ts`'s `marketItemUrl`) — tab is a path segment,
  // so there is no longer a "which tab is this?" ambiguity for a click that
  // means "browse this item" to paper over.
  const typeIsValid = resolveAgainstCatalogue(
    parsedParams.typeId,
    types,
    (ty, id) => ty.typeId === id
  );
  const selectedTypeId = parsedParams.typeId !== null && typeIsValid ? parsedParams.typeId : null;

  // One pass over `groups` builds both lookups this route needs — by id (this
  // param's validation and the ancestor walk below) and by parent
  // (`childrenByParent`, the tree's own render shape, further down).
  const groupCatalogue = useMemo(() => {
    const byId = new Map<number, MarketGroupNode>();
    const byParent = new Map<number | null, MarketGroupNode[]>();
    for (const group of groups ?? []) {
      byId.set(group.id, group);
      const list = byParent.get(group.parentId) ?? [];
      list.push(group);
      byParent.set(group.parentId, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return { byId, byParent };
  }, [groups]);
  const groupsById = groupCatalogue.byId;

  const groupIdIsValid =
    parsedParams.groupId === null
      ? false
      : groups === null
        ? true
        : groupsById.has(parsedParams.groupId);
  const linkedGroupId = groupIdIsValid ? parsedParams.groupId : null;

  // A `?group=` cross-link lands the tree pre-expanded to that category,
  // additive to whatever's already open, once per incoming id — a ref, not
  // state, since a manual re-collapse afterwards must not be fought back open.
  const expandedForGroupId = useRef<number | null>(null);
  useEffect(() => {
    if (groups === null || linkedGroupId === null || linkedGroupId === expandedForGroupId.current) {
      return;
    }
    const ancestry = new Set<number>();
    addAncestors(linkedGroupId, groupsById, ancestry);
    setExpandedIds((prev) => new Set([...prev, ...ancestry]));
    expandedForGroupId.current = linkedGroupId;
  }, [groups, linkedGroupId, groupsById]);

  const regionIsValid = resolveAgainstCatalogue(
    parsedParams.regionId,
    marketRegions,
    (r, id) => r.id === id
  );
  // A hub id is a small static set (`TRADE_HUBS`), so unlike the region
  // catalogue there's no loading window to be optimistic about.
  const hubIsValid =
    parsedParams.hubId !== null && getTradeHub(parsedParams.hubId as TradeHub['id']) !== undefined;

  // Whichever of region/hub the URL names wins, falling back to the
  // device-local Location Mode preference when neither param resolves.
  const fallbackLocation: MarketLocationParam = useMemo(
    () =>
      locationModeValue.mode === 'region'
        ? { mode: 'region', regionId: locationModeValue.regionId ?? hub.regionId }
        : { mode: 'hub', hubId: hub.id },
    [locationModeValue, hub]
  );
  const effectiveLocation: MarketLocationParam = useMemo(
    () =>
      resolveMarketLocation(
        parsedParams,
        { region: regionIsValid, hub: hubIsValid },
        fallbackLocation
      ),
    [parsedParams, regionIsValid, hubIsValid, fallbackLocation]
  );
  const effectiveHub =
    effectiveLocation.mode === 'hub'
      ? (getTradeHub(effectiveLocation.hubId as TradeHub['id']) ?? hub)
      : hub;

  const chosenRegionId =
    effectiveLocation.mode === 'region' ? effectiveLocation.regionId : effectiveHub.regionId;

  // Held here rather than inside `AppraisalPanel` so a pasted list survives a
  // trip to the Browser tab, and so the header's refresh button can drive it.
  const appraisal = useAppraisal(effectiveHub, pricePercent, activeCharacterId);

  // The selected item's settled fetch, null until it lands. The view itself is
  // derived below, so the "filter to this station" action narrows it in place
  // without another request.
  const [orderBookFetch, setOrderBookFetch] = useState<OrderBookFetch | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Every authenticated character's own open order ids, across every item —
  // not scoped to the selected type, since matching is by order_id against
  // whatever's on screen. Membership is the whole question here: a row that
  // is mine gets a tinted background, and nothing else. How badly a rival
  // beats it is the Open Orders page's job, which has the cost basis and the
  // exits to say something useful about it.
  const [myOrderIds, setMyOrderIds] = useState<ReadonlySet<number>>(new Set());
  const [sellShowAll, setSellShowAll] = useState(false);
  const [buyShowAll, setBuyShowAll] = useState(false);
  // The order row context menu's "filter to this station" action (CONTEXT.md
  // round 10); undone via the banner rendered above the tables. URL-backed
  // (ADR 0015), scoped to the Browser tab.
  const [stationFilter, setStationFilter] = useUrlParam('browser.station', STATION_FILTER_PARAM);
  // Jump Range (Region mode only — Hub mode is already one station):
  // "how far from me" narrows the order book next to the station filter, see
  // `orderBookView.ts`'s `allowedSystems`.
  const [jumpRange, setJumpRange] = useUrlParam('browser.jumps', JUMP_RANGE_PARAM);
  const currentSystem = useCurrentSystem();
  const jumpRangeFilter = useJumpRangeFilter(currentSystem.systemId, jumpRange);
  // Market Data / Price History (issue #11), Market Data selected by default —
  // a scoped query param rather than a `/market/browser/<subtab>` path
  // segment (docs/ARCHITECTURE.md §9): it only ever matters with an item
  // already selected, so it rides along with `type` rather than living a
  // level of path beneath it.
  const [itemTab, setItemTab] = useUrlParam('browser.itemTab', ITEM_TAB_PARAM);
  // "Adjusting state when a prop changes" (react.dev): resets the previous
  // item's row-cap, station filter and order book the instant selection or
  // the resolved region changes, in the same render — an Effect would let
  // the old item's (or old region's) rows flash under the new title. Keyed
  // on `chosenRegionId` rather than the persisted `hubId` store: the two can
  // diverge when a shared link or browser back/forward drives a different
  // effective hub without writing the device's persisted default.
  /**
   * A blueprint *original* can be sold on the market; a **copy** cannot — BPCs
   * are contract-only. So an empty order book on a blueprint is the one case
   * where "nobody is selling this" is misleading, and the honest answer is to
   * point at the BPC search rather than leave the pilot to conclude the item
   * is unavailable.
   */
  const selectedIsBlueprint =
    selectedTypeId !== null && (blueprintCatalog?.byBlueprintTypeID.has(selectedTypeId) ?? false);

  const resetKey = `${selectedTypeId ?? 'none'}:${chosenRegionId}`;
  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (resetKey !== resetForKey) {
    setResetForKey(resetKey);
    setSellShowAll(false);
    setBuyShowAll(false);
    setOrderBookFetch(null);
    // `browser.station` clears in `navigateTo` itself, not here — every path
    // that changes `resetKey` goes through it, and clearing it here too was a
    // second, independent `useUrlParams` writer landing in the same render as
    // `navigateTo`'s own write, which silently dropped one of the two.
    // Set in the same render as the reset above, not left for the fetch
    // effect a tick later — otherwise the one commit in between paints
    // `orderBookLoading: false` alongside the just-cleared `orderBookFetch`,
    // which the table below reads as "loaded, and empty" and flashes the
    // empty state before the spinner.
    if (selectedTypeId !== null) setOrderBookLoading(true);
  }

  useEffect(() => {
    void hydrateHub();
    void hydrateLocationMode();
    void hydratePricePercent();
  }, [hydrateHub, hydrateLocationMode, hydratePricePercent]);

  // Catches the device's persisted Location Mode up to a valid URL override.
  // `buildMarketParams` only ever writes one of `hub`/`region` at a time, so
  // a URL-supplied hub is dropped from the query string the moment the mode
  // toggles to Region — without this, toggling back to Trade Hub would have
  // nothing left to read and would fall back to whatever hub was persisted
  // before the link was opened, silently abandoning what the link pointed
  // at. `effectiveLocation`/`effectiveHub` still read the URL directly for
  // the render that shows the link's own view, so this is purely about what
  // survives a later, unrelated interaction.
  useEffect(() => {
    if (!hubHydrated || !locationModeHydrated) return;
    if (hubIsValid && parsedParams.hubId !== null && parsedParams.hubId !== hubId) {
      void setHubId(parsedParams.hubId as TradeHub['id']);
    }
    if (
      regionIsValid &&
      parsedParams.regionId !== null &&
      (locationModeValue.mode !== 'region' || locationModeValue.regionId !== parsedParams.regionId)
    ) {
      void setLocationModeValue({ mode: 'region', regionId: parsedParams.regionId });
    }
  }, [
    parsedParams,
    hubIsValid,
    regionIsValid,
    hubId,
    locationModeValue,
    hubHydrated,
    locationModeHydrated,
    setHubId,
    setLocationModeValue,
  ]);

  // The "jump to search" shortcut (`lib/shortcuts.ts`) navigates here with
  // this state to focus the box in one step, from anywhere in the app.
  useEffect(() => {
    if ((location.state as Partial<MarketFocusSearchState> | null)?.focusSearch) {
      searchInputRef.current?.focus();
    }
  }, [location.state]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadMarketGroups(),
      loadMarketTypes(),
      loadNpcStations(),
      loadSolarSystems(),
      loadMarketRegions(),
    ])
      .then(([g, ty, stations, systems, regions]) => {
        if (cancelled) return;
        setGroups(g);
        setTypes(ty);
        setNpcStations(stations);
        setSolarSystems(systems);
        setMarketRegions(regions);
      })
      .catch(() => {
        if (!cancelled) setCatalogueError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Independent of the catalogue and order-book loads: a character with no
  // orders scope, or with no characters signed in at all, simply resolves to
  // an empty set — the highlight below then degrades to "nothing here is
  // mine" rather than erroring. Refetches on a manual Refresh (refreshTick)
  // the same way the order book itself does, so placing or cancelling an
  // order and hitting Refresh updates the highlight in place.
  useEffect(() => {
    let cancelled = false;
    void loadAllCharactersOpenOrders()
      .then((snapshot) => {
        if (cancelled) return;
        const ids = new Set<number>();
        for (const entry of snapshot.entries) {
          for (const order of entry.orders) ids.add(order.order_id);
        }
        setMyOrderIds(ids);
      })
      .catch(() => {
        // Leaves myOrderIds at whatever it was — a failed fetch must not
        // erase an already-known highlight.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // Fetched independently of the catalogue load above: variations.json is
  // Variations-panel-only data, so a slow or failed fetch degrades that one
  // panel to its Market-Group-sibling fallback (see variationsResult below)
  // rather than blocking or erroring the whole Market route.
  useEffect(() => {
    let cancelled = false;
    void loadVariations()
      .then((variations) => {
        if (!cancelled) setVariationData(variations);
      })
      .catch(() => {
        // Leaves variationData null — variationsResult below already treats
        // that the same as "no variation data for this item".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const globalMarketsMap = globalMarkets ?? NO_GLOBAL_MARKETS;

  // The one location every order book on this page reads through — the
  // tables, the Variations rows, the Compare Drawer and Item Detail — so they
  // can't disagree about the same item (`orderBookView.ts`). Built from the
  // effective (URL-aware) location, not the persisted preference.
  const orderBookLocation = useMemo<OrderBookLocation>(
    () =>
      orderBookLocationFor(effectiveLocation.mode, chosenRegionId, effectiveHub, globalMarketsMap),
    [effectiveLocation.mode, chosenRegionId, effectiveHub, globalMarketsMap]
  );

  const resolvedRegion = useMemo(
    () =>
      selectedTypeId === null
        ? null
        : resolveOrderBookRegion(selectedTypeId, chosenRegionId, globalMarketsMap),
    [selectedTypeId, chosenRegionId, globalMarketsMap]
  );

  // Refetches on selection, location, or a manual Refresh click. Gated on both
  // *Hydrated flags so this doesn't fire once for the defaults and again once
  // the persisted settings resolve. `fetchOrderBook` never rejects: a 420 or
  // an Error Budget refusal settles as `'failed'`, which renders its own
  // state rather than an empty book or a spinner that never clears.
  useEffect(() => {
    // Also waits for globalMarkets.json to settle (success or failure):
    // before it does, a Global Market Region item (a PLEX deep link) would be
    // read from the wrong region.
    if (selectedTypeId === null || !hubHydrated || !locationModeHydrated || globalMarkets === null)
      return;
    let cancelled = false;
    void (async () => {
      setOrderBookLoading(true);
      const fetched = await fetchOrderBook(selectedTypeId, orderBookLocation);
      if (cancelled) return;
      setOrderBookFetch(fetched);
      setOrderBookLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedTypeId,
    orderBookLocation,
    hubHydrated,
    locationModeHydrated,
    globalMarkets,
    refreshTick,
  ]);

  const childrenByParent = groupCatalogue.byParent;

  const typesByGroup = useMemo(() => {
    const map = new Map<number, MarketTypeEntry[]>();
    for (const type of types ?? []) {
      const list = map.get(type.marketGroupId) ?? [];
      list.push(type);
      map.set(type.marketGroupId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [types]);

  const typesById = useMemo(
    () => new Map((types ?? []).map((type) => [type.typeId, type])),
    [types]
  );

  // Built once per SDE load, not per selection — getVariations is then
  // O(group size) per call instead of re-scanning the whole types map.
  // Defaults to EMPTY_VARIATION_INDEX before variations.json resolves, so
  // the Variations panel falls back to siblings rather than going blank.
  const variationIndex = useMemo(
    () =>
      variationData
        ? buildVariationIndex(variationData.types, variationData.metaGroups)
        : EMPTY_VARIATION_INDEX,
    [variationData]
  );

  const filterResult = useMemo(
    () => (groups && types ? filterMarketTree(groups, types, query) : null),
    [groups, types, query]
  );

  const npcStationMap = useMemo(
    () => new Map((npcStations ?? []).map((s) => [s.id, { name: s.name, systemId: s.systemId }])),
    [npcStations]
  );
  const solarSystemMap = useMemo(
    () => new Map((solarSystems ?? []).map((s) => [s.id, { name: s.name, security: s.security }])),
    [solarSystems]
  );

  // Region mode only — Hub mode is already one station, so a jump range over
  // it would just repeat the hub filter under a different name.
  const allowedSystems =
    effectiveLocation.mode === 'region' && jumpRangeFilter.status === 'ready'
      ? jumpRangeFilter.allowed
      : null;

  // Location Mode, Trade Hub station, the order-row "filter to this station"
  // action (CONTEXT.md round 10), Jump Range, split and sort all happen in
  // the view.
  const orderBookView = useMemo(
    () =>
      orderBookFetch === null || selectedTypeId === null
        ? null
        : buildOrderBookView(
            selectedTypeId,
            { ...orderBookLocation, stationFilter, allowedSystems },
            orderBookFetch
          ),
    [orderBookFetch, selectedTypeId, orderBookLocation, stationFilter, allowedSystems]
  );
  const loadedView = orderBookView?.status === 'failed' ? null : orderBookView;
  const orderBookFailed = orderBookView?.status === 'failed';
  const sortedSell = useMemo(() => loadedView?.sell ?? [], [loadedView]);
  const sortedBuy = useMemo(() => loadedView?.buy ?? [], [loadedView]);
  /**
   * The catalogue is otherwise loaded lazily on the first context-menu open,
   * so reading it here without asking for it meant `selectedIsBlueprint` was
   * always false on a fresh page and the hint below never appeared at all.
   * Requested only once the book is actually empty, which keeps the laziness
   * this was built for: the payload is fetched in the one case its answer can
   * change what is rendered, not on every item you click.
   */
  useEffect(() => {
    // `ensureBlueprintCatalog` is ref-guarded, so re-running this costs nothing.
    // A failed book says nothing about who sells the item, so it asks nothing.
    if (selectedTypeId !== null && loadedView && sortedSell.length === 0) ensureBlueprintCatalog();
  }, [selectedTypeId, loadedView, sortedSell.length]);

  const sellRows = sellShowAll ? sortedSell : sortedSell.slice(0, ROW_CAP);
  const buyRows = buyShowAll ? sortedBuy : sortedBuy.slice(0, ROW_CAP);

  const stationFilterLabel = useMemo(() => {
    if (stationFilter === null || orderBookFetch?.status !== 'fetched') return null;
    const order = orderBookFetch.result.orders.find((o) => o.location_id === stationFilter);
    if (!order) return null;
    const location = resolveOrderLocation(order, npcStationMap, solarSystemMap);
    // Names the same station the Location column does, so the banner and the
    // rows below it read alike.
    return location.stationName ?? t('market.unknownStructure');
  }, [stationFilter, orderBookFetch, npcStationMap, solarSystemMap, t]);

  const baseColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => [
      {
        id: 'price',
        header: t('market.price'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => (
          <>
            {formatIsk(o.price, 2)}
            {/*
              The tinted row (`row-mine`, styles/index.css) is the visible
              marker for "this one is mine" — no badge, no gap figure,
              nothing that adds a line to every row of a book you scan by
              price. Colour is never the sole signal though (docs/DESIGN.md
              §7), so the word rides along unseen, the way `CorpBoardRow`'s
              severity label does.
            */}
            {myOrderIds.has(o.order_id) && <span className="sr-only">{t('market.myOrder')}</span>}
          </>
        ),
        sortValue: (o) => o.price,
      },
      {
        id: 'quantity',
        header: t('market.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => formatVolume(o.volume_remain),
        sortValue: (o) => o.volume_remain,
      },
      {
        id: 'location',
        header: t('market.location'),
        render: (o) => (
          <LocationCell order={o} npcStations={npcStationMap} solarSystems={solarSystemMap} t={t} />
        ),
      },
      {
        id: 'expiry',
        header: t('market.expiry'),
        className: 'whitespace-nowrap text-text-dim',
        render: (o) => orderExpiry(o).toLocaleDateString(),
        sortValue: (o) => orderExpiry(o).getTime(),
      },
    ],
    [t, npcStationMap, solarSystemMap, myOrderIds]
  );
  const buyColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => [
      ...baseColumns,
      {
        id: 'range',
        header: t('market.range'),
        className: 'text-text-dim',
        render: (o) => rangeLabel(o.range, t),
      },
      {
        id: 'minVolume',
        header: t('market.minVolume'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => formatVolume(o.min_volume),
        sortValue: (o) => o.min_volume,
      },
    ],
    [baseColumns, t]
  );

  function handleToggle(groupId: number) {
    const setter = filterResult !== null ? setSearchCollapsedIds : setExpandedIds;
    setter((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // Every handler that changes the selected item or the location writes the
  // persisted device setting (unchanged) *and* pushes the new query string,
  // as its own history entry, so a URL grabbed right after matches what's on
  // screen and the browser's back/forward walks through prior selections.
  //
  // `buildMarketParams` returns the canonical type/hub/region set, and
  // replacing those wholesale is the point — `group` goes with them (a
  // one-shot cross-link param, never re-applied once acted on). `browser.station`
  // goes too: every call here means a new item or location, which is exactly
  // when the "filter to this station" banner should clear (previously done by
  // `setStationFilter(null)` in the resetKey effect below — moved here because
  // that call and this one are two independent `useUrlParams` writers landing
  // in the very same render, and the second one silently dropped the first's
  // write, per the "two writers, same tick" hazard `useUrlState.ts` documents).
  // `browser.q`/`browser.itemTab` survive untouched: the tab lives in the path
  // now, not here, so there is no longer a `?section=` this needs to carry along.
  function navigateTo(typeId: number | null, next: MarketLocationParam) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('type');
      params.delete('hub');
      params.delete('region');
      params.delete('group');
      params.delete('browser.station');
      for (const [key, value] of Object.entries(buildMarketParams(typeId, next))) {
        params.set(key, value);
      }
      return params;
    });
  }

  function handleModeChange(mode: LocationMode) {
    if (mode === effectiveLocation.mode) return;
    // Toggling off a URL-supplied location keeps *that* hub/region, not the
    // device's persisted default — otherwise a shared `?hub=amarr` link
    // reverts to the visitor's own Jita default the instant they touch the
    // toggle, which isn't "restores exactly what the sender saw" anymore.
    const regionId = locationModeValue.regionId ?? effectiveHub.regionId;
    void setLocationModeValue({ mode, regionId });
    navigateTo(
      selectedTypeId,
      mode === 'region' ? { mode: 'region', regionId } : { mode: 'hub', hubId: effectiveHub.id }
    );
  }

  function handleHubChange(id: TradeHub['id']) {
    void setHubId(id);
    navigateTo(selectedTypeId, { mode: 'hub', hubId: id });
  }

  function handleRegionChange(regionId: number) {
    void setLocationModeValue({ mode: 'region', regionId });
    navigateTo(selectedTypeId, { mode: 'region', regionId });
  }

  function handleSelectItem(typeId: number) {
    navigateTo(typeId, effectiveLocation);
  }

  function handleBackToFinder() {
    navigateTo(null, effectiveLocation);
  }

  function handleRefresh() {
    // On Appraisal the button re-prices the pasted list instead, dropping the
    // Fuzzwork TTL for those types only (`invalidateHubPrices`). Nothing
    // below applies: there is no selected item and no order book on this tab.
    if (tab === 'appraisal') {
      appraisal.refresh();
      return;
    }
    // Manual refresh must bypass getOrderBook's 300s TTL cache (CONTEXT.md
    // "Data Age": refresh happens on app open + manual button only) — scoped
    // to what's actually on screen (the selected item, plus the Variations
    // table rows beneath it, which reuse this same tick to refetch their own
    // prices in place), not a global wipe. That's the difference from the
    // Compare Drawer: its rows aren't part of this page's own render, so
    // they keep whatever's still within TTL instead of being forced to
    // refetch just because something else on the page was refreshed. Also
    // the failed order book's "Try again".
    if (selectedTypeId !== null) clearOrderBookViewCache(selectedTypeId, orderBookLocation);
    for (const row of variationsResultRef.current?.rows ?? []) {
      clearOrderBookViewCache(row.typeId, orderBookLocation);
    }
    setRefreshTick((n) => n + 1);
  }

  function orderRowContextMenu(order: RegionOrder, tr: ReactElement) {
    return (
      <OrderRowContextMenu
        order={order}
        trigger={tr}
        npcStations={npcStationMap}
        solarSystems={solarSystemMap}
        onFilterToStation={setStationFilter}
        typeId={selectedTypeId ?? 0}
        itemName={selectedItem?.name ?? ''}
        onShowInfo={handleShowInfo}
      />
    );
  }

  // variationData isn't included here — it's fetched by its own effect,
  // independent of the primary catalogue load, so a slow or failed
  // variations.json never blocks or errors the rest of the page.
  const catalogueLoading =
    !catalogueError && (!groups || !types || !npcStations || !solarSystems || !marketRegions);
  const selectedItem = types?.find((ty) => ty.typeId === selectedTypeId) ?? null;
  // Narrow screens only: on desktop the item finder is already on screen
  // beside the item, so there is nothing to go back to. It sits in the
  // Panel's `leading` slot, immediately left of the item name — it means
  // "back from this item", so it belongs against the name rather than parked
  // on the opposite edge of the header.
  const showBackControl = !isDesktop && selectedTypeId !== null;
  const itemPanelLeading = showBackControl ? (
    <IconButton
      size="sm"
      icon={<Icon.Back />}
      label={t('market.backToFinder')}
      onClick={handleBackToFinder}
    />
  ) : undefined;

  // Variations (CONTEXT.md round 6): the selected item's Tech/Meta/Faction
  // variation group, falling back to Market Group siblings, re-anchored
  // whenever selectedItem changes — including a click on a row itself, which
  // just becomes the new selectedItem.
  const variationsResult = useMemo(
    () =>
      selectedItem ? getVariationRows(variationIndex, typesByGroup, typesById, selectedItem) : null,
    [variationIndex, typesByGroup, typesById, selectedItem]
  );
  // Latest-ref pattern (useCompareRows.ts): handleRefresh is declared above
  // this memo (it needs to be in scope for the header's onClick) and reads
  // this value only on click, well after it settles — a ref sidesteps that
  // ordering entirely instead of asking the render function to read ahead.
  const variationsResultRef = useRef(variationsResult);
  useEffect(() => {
    variationsResultRef.current = variationsResult;
  });

  const [variationPrices, setVariationPrices] = useState<
    ReadonlyMap<number, OrderBookSummary | undefined>
  >(new Map());
  // Same "adjusting state when a prop changes" pattern as resetKey above:
  // clears stale row prices the instant the row set or the location changes,
  // in the same render — an Effect would let the old item's prices flash
  // under the new table. stationFilter is included so the table stays in
  // step with the order-row "filter to this station" action (CONTEXT.md
  // round 10) the same way the on-screen tables do; refreshTick deliberately
  // isn't, so a manual refresh updates prices in place instead of blanking
  // the table back to a loading state.
  const variationResetKey = variationsResult
    ? `${variationsResult.rows.map((row) => row.typeId).join(',')}:${chosenRegionId}:${orderBookLocation.mode}:${orderBookLocation.hubStationId}:${stationFilter ?? 'none'}`
    : 'none';
  const [variationResetForKey, setVariationResetForKey] = useState<string | null>(null);
  if (variationResetKey !== variationResetForKey) {
    setVariationResetForKey(variationResetKey);
    setVariationPrices(new Map());
  }

  // Fetched independently of the main order book, so a slow row's price
  // never delays the order book's own render (acceptance criteria). Also
  // reruns on refreshTick so a manual Refresh — which clears getOrderBook's
  // cache — refetches row prices too, not just the on-screen tables.
  useEffect(() => {
    if (
      !variationsResult ||
      variationsResult.rows.length === 0 ||
      !hubHydrated ||
      !locationModeHydrated ||
      globalMarkets === null
    ) {
      return;
    }
    let cancelled = false;
    // Capped, not one Promise.all: ~20 rows fired at once tripped Sentry's
    // N+1 API Call detector (ORDER_BOOK_FANOUT_CONCURRENCY).
    void mapWithConcurrencyLimit(
      variationsResult.rows,
      ORDER_BOOK_FANOUT_CONCURRENCY,
      async (row) => {
        if (cancelled) return;
        const view = await loadOrderBookView(row.typeId, { ...orderBookLocation, stationFilter });
        if (cancelled) return;
        // A row's own price is a nice-to-have next to the order book that did
        // load; a failed fetch reads as "no orders" (the empty summary) rather
        // than stalling the table on a spinner forever.
        const summary: OrderBookSummary =
          view.status === 'failed'
            ? { bestSell: null, bestBuy: null, spread: null, availableVolume: 0 }
            : view.summary;
        setVariationPrices((prev) => new Map(prev).set(row.typeId, summary));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    variationsResult,
    orderBookLocation,
    stationFilter,
    hubHydrated,
    locationModeHydrated,
    globalMarkets,
    refreshTick,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('market.title')}
        actions={
          usesHubPicker(tab) ? (
            <>
              {/* The mode chip and the picker next to it printed the same words
                  twice — "TRADE HUB · REGION · TRADE HUB [Jita]". The selected chip
                  *is* the picker's label, so the picker keeps the string as its
                  `aria-label` only: still announced, no longer duplicated on
                  screen.

                  Browser only: see `usesHubPicker`. Appraisal prices at a
                  station, so it has no Region mode to toggle into. */}
              {tab === 'browser' && (
                <div role="group" aria-label={t('market.locationMode')} className="flex gap-2">
                  <FilterChip
                    label={t('market.modeHub')}
                    selected={effectiveLocation.mode === 'hub'}
                    onToggle={() => handleModeChange('hub')}
                  />
                  <FilterChip
                    label={t('market.modeRegion')}
                    selected={effectiveLocation.mode === 'region'}
                    onToggle={() => handleModeChange('region')}
                  />
                </div>
              )}
              {effectiveLocation.mode === 'hub' || tab === 'appraisal' ? (
                <Select
                  value={effectiveHub.id}
                  onValueChange={(value) => handleHubChange(value as TradeHub['id'])}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={t('market.tradeHub')}
                    className="w-32 sm:w-44"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADE_HUBS.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.systemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={String(chosenRegionId)}
                  onValueChange={(value) => handleRegionChange(Number(value))}
                >
                  <SelectTrigger size="sm" aria-label={t('market.region')} className="w-32 sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(marketRegions ?? []).map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('market.refresh')}
                onClick={handleRefresh}
                // Section-aware: on the Browser this re-reads the selected
                // item's order book, on Appraisal it re-prices the pasted
                // list. Both are "refresh what is on screen", and neither has
                // anything to do until there *is* something on screen.
                disabled={
                  tab === 'appraisal'
                    ? appraisal.result === null || appraisal.loading
                    : selectedTypeId === null || orderBookLoading
                }
              />
            </>
          ) : undefined
        }
      />

      <Tabs
        label={t('market.title')}
        value={isHistoryView(tab) ? 'history' : tab}
        // Clicking History while already inside it would otherwise throw away
        // the chosen view and snap back to the orders one.
        onChange={(id) => {
          if (id === 'history' && isHistoryView(tab)) return;
          changeTab(id as MarketTab);
        }}
        tabs={[
          { id: 'browser', label: t('market.sections.browser') },
          { id: 'orders', label: t('market.sections.openOrders') },
          { id: 'history', label: t('market.sections.history') },
          { id: 'appraisal', label: t('market.sections.appraisal') },
        ]}
      />

      {tab === 'orders' && <OpenOrdersPanel />}

      {tab === 'history' && (
        <OrderHistoryPanel
          onViewChange={(view) =>
            changeTab(view === 'transactions' ? 'history/transactions' : 'history')
          }
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
        />
      )}
      {tab === 'history/transactions' && (
        <TransactionsPanel
          onViewChange={(view) =>
            changeTab(view === 'transactions' ? 'history/transactions' : 'history')
          }
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
        />
      )}

      {/* The list itself lives in `useAppraisal` at route level, so switching
          to the Browser and back does not throw away a forty-line paste. */}
      {tab === 'appraisal' && (
        <AppraisalPanel
          controller={appraisal}
          pricePercent={pricePercent}
          onPricePercentChange={(value) => void setPricePercent(value)}
          hub={effectiveHub}
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
          defaultCompareExpanded={expandCompareOnAppraisal}
        />
      )}

      {tab === 'browser' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
          <Panel className={isDesktop || selectedTypeId === null ? '' : 'hidden'}>
            <SearchInput
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('market.searchPlaceholder')}
              aria-label={t('market.searchLabel')}
            />

            {query.trim().length > 0 && query.trim().length < MARKET_TREE_MIN_QUERY_LENGTH && (
              <p className="pt-2 text-[0.6875rem] text-text-dim uppercase">
                {t('market.searchTooShort', { min: MARKET_TREE_MIN_QUERY_LENGTH })}
              </p>
            )}

            {filterResult?.capped && (
              <p className="pt-2 text-[0.6875rem] text-warning uppercase">
                {t('market.searchCapped', {
                  limit: MARKET_TREE_MATCH_LIMIT,
                  total: filterResult.totalMatches,
                })}
              </p>
            )}

            {catalogueError ? (
              <EmptyState
                title={t('market.loadFailedTitle')}
                hint={t('market.loadFailedHint')}
                className="py-8"
              />
            ) : catalogueLoading ? (
              <div className="flex justify-center py-8">
                <Spinner label={t('common.loading')} />
              </div>
            ) : filterResult && filterResult.visibleGroupIds.size === 0 ? (
              <EmptyState title={t('market.noResults')} className="py-8" />
            ) : (
              <div className="mt-3 border-t border-line pt-2">
                <MarketGroupTree
                  groups={groups ?? []}
                  childrenByParent={childrenByParent}
                  typesByGroup={typesByGroup}
                  filterResult={filterResult}
                  expandedIds={expandedIds}
                  searchCollapsedIds={searchCollapsedIds}
                  onToggle={handleToggle}
                  onSelect={handleSelectItem}
                  selectedTypeId={selectedTypeId}
                  blueprintCatalog={blueprintCatalog}
                  onRequestBlueprintCatalog={ensureBlueprintCatalog}
                  onAddToQuickbar={handleAddToQuickbar}
                  quickbarAvailable={activeCharacterId !== null}
                  onShowInfo={handleShowInfo}
                />
              </div>
            )}

            <QuickbarList
              items={quickbarItems}
              selectedTypeId={selectedTypeId}
              onSelect={handleSelectItem}
              onRemove={handleRemoveFromQuickbar}
              onReorder={handleReorderQuickbar}
              onSetTarget={handleSetQuickbarTarget}
              onViewInAppraisal={handleViewQuickbarInAppraisal}
            />
          </Panel>

          <Panel
            className={isDesktop || selectedTypeId !== null ? '' : 'hidden'}
            title={selectedItem?.name}
            padded={selectedTypeId === null}
            leading={itemPanelLeading}
          >
            {selectedTypeId === null ? (
              <EmptyState
                title={t('market.selectPromptTitle')}
                hint={t('market.selectPromptHint')}
                className="py-8"
              />
            ) : (
              <>
                <Tabs
                  tabs={[
                    { id: 'orders', label: t('market.tabOrders') },
                    { id: 'history', label: t('market.tabHistory') },
                  ]}
                  value={itemTab}
                  onChange={(id) => setItemTab(id as 'orders' | 'history')}
                  label={t('market.itemTabsLabel')}
                  className="px-3 pt-2"
                />
                {itemTab === 'history' ? (
                  resolvedRegion && (
                    <PriceHistoryPanel
                      regionId={resolvedRegion.regionId}
                      typeId={selectedTypeId}
                      itemName={selectedItem?.name ?? ''}
                    />
                  )
                ) : orderBookLoading && (!orderBookView || orderBookFailed) ? (
                  <div className="flex justify-center py-8">
                    <Spinner label={t('common.loading')} />
                  </div>
                ) : orderBookFailed ? (
                  // Not the empty book: ESI didn't answer (a 420, or the Error
                  // Budget declining to send), which says nothing about who
                  // trades the item — so no "nobody is selling" copy and no
                  // blueprint BPC hint, just the failure and a way to retry.
                  <EmptyState
                    title={t('market.orderBookFailedTitle')}
                    hint={t('market.orderBookFailedHint')}
                    className="py-8"
                    action={
                      <Button size="sm" onClick={handleRefresh}>
                        {t('market.orderBookFailedRetry')}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    {resolvedRegion?.override && (
                      <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                        {t('market.globalMarketNote', {
                          regionName: resolvedRegion.override.regionName,
                        })}
                      </p>
                    )}
                    <div className="divide-y divide-line">
                      {effectiveLocation.mode === 'region' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-text-dim">
                          <div className="flex items-center gap-2">
                            <JumpRangeSelect value={jumpRange} onChange={setJumpRange} />
                            <CurrentSystemPicker current={currentSystem} />
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <JumpRangeNote status={jumpRangeFilter.status} />
                            {jumpRangeFilter.status === 'ready' && (
                              <span>{t('jumpRange.regionOnlyHint')}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {stationFilter !== null && (
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-text-dim">
                          <span>
                            {t('market.stationFilterActive', {
                              station: stationFilterLabel ?? t('market.unknownStructure'),
                            })}
                          </span>
                          <Button size="sm" onClick={() => setStationFilter(null)}>
                            {t('market.clearStationFilter')}
                          </Button>
                        </div>
                      )}

                      <div className="pb-3">
                        {/*
                        Each export sits with the table it exports. Both were
                        in the panel header, where — once they became icons —
                        they were two identical download glyphs telling a
                        sighted user nothing apart; only their tooltips
                        differed, and a touch user never sees those. Beside
                        "Sell orders" the same glyph is unambiguous.
                      */}
                        <div className="flex items-center justify-between px-3 pt-3 pb-1">
                          <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                            {t('market.sell')}
                          </h2>
                          <span className="flex items-center gap-1">
                            <IconButton
                              size="sm"
                              icon={<Icon.Download />}
                              label={t('market.exportCsvSell')}
                              disabled={sortedSell.length === 0}
                              onClick={() =>
                                downloadCsv(
                                  'market-sell',
                                  sortedSell,
                                  orderBookCsvColumns(t, {
                                    npcStations: npcStationMap,
                                    solarSystems: solarSystemMap,
                                    isBuy: false,
                                  }),
                                  new Date(),
                                  loadedView?.truncated ?? false
                                )
                              }
                            />
                          </span>
                        </div>
                        {sortedSell.length === 0 ? (
                          <EmptyState
                            title={t('market.emptySellTitle')}
                            hint={
                              stationFilter !== null
                                ? t('market.emptyFilteredHint')
                                : selectedIsBlueprint
                                  ? t('market.emptySellBlueprintHint')
                                  : t('market.emptySellHint')
                            }
                            className="py-6"
                            action={
                              selectedIsBlueprint &&
                              stationFilter === null &&
                              selectedTypeId !== null ? (
                                <Link
                                  to={bpcSourcingHref(selectedTypeId)}
                                  className={buttonClassName({ size: 'sm' })}
                                >
                                  {t('market.searchBpcContracts')}
                                </Link>
                              ) : undefined
                            }
                          />
                        ) : (
                          <>
                            <DataTable
                              columns={baseColumns}
                              rows={sellRows}
                              rowKey={(o) => o.order_id}
                              label={t('market.sell')}
                              defaultSort={{ columnId: 'price', direction: 'asc' }}
                              rowContextMenu={orderRowContextMenu}
                              rowClassName={(o) =>
                                myOrderIds.has(o.order_id) ? 'row-mine' : undefined
                              }
                            />
                            {!sellShowAll && sortedSell.length > ROW_CAP && (
                              <div className="px-3 py-2">
                                <Button size="sm" onClick={() => setSellShowAll(true)}>
                                  {t('market.showAll', { count: sortedSell.length })}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="pb-3">
                        <div className="flex items-center justify-between px-3 pt-3 pb-1">
                          <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                            {t('market.buy')}
                          </h2>
                          <span className="flex items-center gap-1">
                            <IconButton
                              size="sm"
                              icon={<Icon.Download />}
                              label={t('market.exportCsvBuy')}
                              disabled={sortedBuy.length === 0}
                              onClick={() =>
                                downloadCsv(
                                  'market-buy',
                                  sortedBuy,
                                  orderBookCsvColumns(t, {
                                    npcStations: npcStationMap,
                                    solarSystems: solarSystemMap,
                                    isBuy: true,
                                  }),
                                  new Date(),
                                  loadedView?.truncated ?? false
                                )
                              }
                            />
                          </span>
                        </div>
                        {sortedBuy.length === 0 ? (
                          <EmptyState
                            title={t('market.emptyBuyTitle')}
                            hint={
                              stationFilter !== null
                                ? t('market.emptyFilteredHint')
                                : t('market.emptyBuyHint')
                            }
                            className="py-6"
                          />
                        ) : (
                          <>
                            <DataTable
                              columns={buyColumns}
                              rows={buyRows}
                              rowKey={(o) => o.order_id}
                              label={t('market.buy')}
                              defaultSort={{ columnId: 'price', direction: 'desc' }}
                              rowContextMenu={orderRowContextMenu}
                              rowClassName={(o) =>
                                myOrderIds.has(o.order_id) ? 'row-mine' : undefined
                              }
                            />
                            {!buyShowAll && sortedBuy.length > ROW_CAP && (
                              <div className="px-3 py-2">
                                <Button size="sm" onClick={() => setBuyShowAll(true)}>
                                  {t('market.showAll', { count: sortedBuy.length })}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/*
                      A gap, so the buy table stops butting straight into the
                      Variations hairline — it reads as one more row block
                      otherwise, not as a separate section.
                    */}
                    {variationsResult && (
                      <div className="mt-3">
                        <VariationsTable
                          rows={variationsResult.rows}
                          totalCount={variationsResult.totalCount}
                          truncated={variationsResult.truncated}
                          prices={variationPrices}
                          onSelect={handleSelectItem}
                          onCompare={() => setCompareModalOpen(true)}
                          blueprintCatalog={blueprintCatalog}
                          onRequestBlueprintCatalog={ensureBlueprintCatalog}
                          onAddToQuickbar={handleAddToQuickbar}
                          quickbarAvailable={activeCharacterId !== null}
                          onShowInfo={handleShowInfo}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </Panel>
        </div>
      )}

      {compareCount > 0 && <CompareDrawer location={orderBookLocation} refreshTick={refreshTick} />}

      {infoModalItem && (
        <ItemDetailModal
          typeId={infoModalItem.typeId}
          itemName={infoModalItem.itemName}
          location={orderBookLocation}
          onClose={() => setInfoModalItem(null)}
        />
      )}

      {compareModalOpen && variationsResult && (
        <VariationsCompareModal
          items={variationsResult.rows}
          prices={variationPrices}
          onClose={() => setCompareModalOpen(false)}
        />
      )}
    </div>
  );
}
