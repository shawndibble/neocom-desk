import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  Panel,
  Spinner,
  Tabs,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { db, type QuickbarItem } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  loadMarketGroups,
  loadMarketTypes,
  loadNpcStations,
  loadSolarSystems,
  loadMarketRegions,
  loadGlobalMarkets,
} from '@/sde/loadMarketSde';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
  GlobalMarketEntry,
} from '@/sde/marketTypes';
import { TRADE_HUBS, DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { useLocationMode, type LocationMode } from '@/features/market/locationMode';
import { filterMarketTree, MARKET_TREE_MATCH_LIMIT } from '@/features/market/marketTree';
import { getOrderBook, clearOrderBookCache } from '@/features/market/orderBook';
import { formatVolume, formatOrderLocationText } from '@/features/market/format';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import { CompareDrawer } from '@/features/market/CompareDrawer';
import { useCompareSet } from '@/features/market/compareSet';
import { QuickbarList } from '@/features/market/QuickbarList';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import {
  addQuickbarItem,
  removeQuickbarItem,
  reorderQuickbarItems,
} from '@/features/market/quickbar';
import {
  splitOrderBook,
  resolveOrderLocation,
  filterOrdersByLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { resolveOrderBookRegion, type GlobalMarketOverride } from '@/engine/market/locationMode';
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

/** Debounce for the catalogue search, so a fast typist doesn't re-filter the tree on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** Rows shown per side before "show all" (CONTEXT.md). */
const ROW_CAP = 15;

/** Matches the `lg:` breakpoint the two-column grid switches on below. */
const DESKTOP_QUERY = '(min-width: 64rem)';

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

function rangeLabel(range: string, t: Translate): string {
  if (range === 'station') return t('market.rangeStation');
  if (range === 'region') return t('market.rangeRegion');
  if (range === 'solarsystem') return t('market.rangeSystem');
  const jumps = Number(range);
  return Number.isFinite(jumps) ? t('market.rangeJumps', { count: jumps }) : range;
}

interface LocationCellProps {
  order: RegionOrder;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  t: Translate;
}

function LocationCell({ order, npcStations, solarSystems, t }: LocationCellProps) {
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  return (
    <span>
      {location.stationName ?? t('market.unknownStructure')}
      <span className="text-text-dim">
        {' '}
        · {location.systemName} ({location.security.toFixed(1)})
      </span>
    </span>
  );
}

interface MarketGroupTreeProps {
  groups: readonly MarketGroupNode[];
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  filterResult: ReturnType<typeof filterMarketTree>;
  expandedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onSelect: (typeId: number) => void;
  selectedTypeId: number | null;
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
}

function MarketGroupTree({
  childrenByParent,
  typesByGroup,
  filterResult,
  expandedIds,
  onToggle,
  onSelect,
  selectedTypeId,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
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
    const expanded = filtering || expandedIds.has(group.id);
    const expandable = children.length > 0 || items.length > 0;

    return (
      <li key={group.id}>
        <button
          type="button"
          disabled={!expandable}
          onClick={() => onToggle(group.id)}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
          className="flex w-full items-center gap-1.5 py-1 text-left text-xs text-text hover:text-accent disabled:hover:text-text"
        >
          {expandable && (
            <span aria-hidden="true" className="w-3 shrink-0 text-text-faint">
              {expanded ? '▾' : '▸'}
            </span>
          )}
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
                    onOpenChange={(open) => {
                      if (open) onRequestBlueprintCatalog();
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.typeId)}
                      style={{ paddingLeft: `${(depth + 1) * 0.75 + 0.75}rem` }}
                      aria-current={selectedTypeId === item.typeId ? 'true' : undefined}
                      className={`w-full truncate py-1 text-left text-xs hover:text-accent ${
                        selectedTypeId === item.typeId ? 'text-accent' : 'text-text-dim'
                      }`}
                    >
                      {item.name}
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const compareCount = useCompareSet((state) => state.items.length);

  const locationModeValue = useLocationMode((state) => state.value);
  const locationModeHydrated = useLocationMode((state) => state.hydrated);
  const hydrateLocationMode = useLocationMode((state) => state.hydrate);
  const setLocationModeValue = useLocationMode((state) => state.setValue);

  // The Quickbar (CONTEXT.md): Editable Data, one record per character. Reads
  // as [] rather than requiring an active character — Market Browser itself
  // needs none — so Add to Quickbar silently no-ops with nobody active.
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const quickbarRecord = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.quickbars.get(String(activeCharacterId));
  }, [activeCharacterId]);
  const quickbarItems = quickbarRecord?.items ?? [];

  async function writeQuickbar(items: QuickbarItem[]) {
    if (activeCharacterId === null) return;
    await db.quickbars.put({
      id: String(activeCharacterId),
      characterId: activeCharacterId,
      items,
      updatedAt: Date.now(),
    });
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  function handleAddToQuickbar(typeId: number, itemName: string) {
    void writeQuickbar(addQuickbarItem(quickbarItems, { typeId, name: itemName }));
  }
  function handleRemoveFromQuickbar(typeId: number) {
    void writeQuickbar(removeQuickbarItem(quickbarItems, typeId));
  }
  function handleReorderQuickbar(activeTypeId: number, overTypeId: number) {
    void writeQuickbar(reorderQuickbarItems(quickbarItems, activeTypeId, overTypeId));
  }

  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
  const [marketRegions, setMarketRegions] = useState<MarketRegionEntry[] | null>(null);
  const [globalMarkets, setGlobalMarkets] = useState<GlobalMarketEntry[] | null>(null);
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

  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(new Set());

  // Narrow screens show one column at a time (CONTEXT.md round 8); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

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

  const typeIsValid = resolveAgainstCatalogue(
    parsedParams.typeId,
    types,
    (ty, id) => ty.typeId === id
  );
  const selectedTypeId = parsedParams.typeId !== null && typeIsValid ? parsedParams.typeId : null;

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

  const [orderBookResult, setOrderBookResult] = useState<{
    orders: RegionOrder[];
    fetchedAt: number;
  } | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sellShowAll, setSellShowAll] = useState(false);
  const [buyShowAll, setBuyShowAll] = useState(false);
  // The order row context menu's "filter to this station" action (CONTEXT.md
  // round 10); undone via the banner rendered above the tables.
  const [stationFilter, setStationFilter] = useState<number | null>(null);
  // Market Data / Price History (issue #11). Market Data selected by default.
  const [itemTab, setItemTab] = useState<'orders' | 'history'>('orders');
  // "Adjusting state when a prop changes" (react.dev): resets the previous
  // item's row-cap, station filter and order book the instant selection or
  // the resolved region changes, in the same render — an Effect would let
  // the old item's (or old region's) rows flash under the new title. Keyed
  // on `chosenRegionId` rather than the persisted `hubId` store: the two can
  // diverge when a shared link or browser back/forward drives a different
  // effective hub without writing the device's persisted default.
  const resetKey = `${selectedTypeId ?? 'none'}:${chosenRegionId}`;
  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (resetKey !== resetForKey) {
    setResetForKey(resetKey);
    setSellShowAll(false);
    setBuyShowAll(false);
    setOrderBookResult(null);
    setStationFilter(null);
  }

  useEffect(() => {
    void hydrateHub();
    void hydrateLocationMode();
  }, [hydrateHub, hydrateLocationMode]);

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
      loadGlobalMarkets(),
    ])
      .then(([g, ty, stations, systems, regions, global]) => {
        if (cancelled) return;
        setGroups(g);
        setTypes(ty);
        setNpcStations(stations);
        setSolarSystems(systems);
        setMarketRegions(regions);
        setGlobalMarkets(global);
      })
      .catch(() => {
        if (!cancelled) setCatalogueError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const globalMarketsMap = useMemo<ReadonlyMap<number, GlobalMarketOverride>>(
    () =>
      new Map(
        (globalMarkets ?? []).map((g) => [
          g.typeId,
          { regionId: g.regionId, regionName: g.regionName },
        ])
      ),
    [globalMarkets]
  );

  const resolvedRegion = useMemo(
    () =>
      selectedTypeId === null
        ? null
        : resolveOrderBookRegion(selectedTypeId, chosenRegionId, globalMarketsMap),
    [selectedTypeId, chosenRegionId, globalMarketsMap]
  );

  // Refetches on selection, region, or a manual Refresh click. Gated on both
  // *Hydrated flags so this doesn't fire once for the defaults and again once
  // the persisted settings resolve.
  useEffect(() => {
    if (selectedTypeId === null || !hubHydrated || !locationModeHydrated || resolvedRegion === null)
      return;
    let cancelled = false;
    void (async () => {
      setOrderBookLoading(true);
      const result = await getOrderBook(resolvedRegion.regionId, selectedTypeId);
      if (cancelled) return;
      setOrderBookResult(result);
      setOrderBookLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, resolvedRegion, hubHydrated, locationModeHydrated, refreshTick]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, MarketGroupNode[]>();
    for (const group of groups ?? []) {
      const list = map.get(group.parentId) ?? [];
      list.push(group);
      map.set(group.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [groups]);

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

  // Trade Hub mode narrows the fetched region down to the hub's own station;
  // Region mode shows every station in the region as fetched (CONTEXT.md).
  // A Global Market Region override still carries ordinary station
  // identifiers, so Trade Hub mode's filter still applies on top of it.
  const displayOrders = useMemo(() => {
    if (!orderBookResult) return [];
    return effectiveLocation.mode === 'hub'
      ? filterOrdersByLocation(orderBookResult.orders, effectiveHub.stationId)
      : orderBookResult.orders;
  }, [orderBookResult, effectiveLocation, effectiveHub.stationId]);

  const { sell, buy } = useMemo(() => splitOrderBook(displayOrders), [displayOrders]);
  // The order-row context menu's "filter to this station" action narrows
  // further, on top of whichever Location Mode is active (CONTEXT.md round 10).
  const filteredSell = useMemo(
    () => filterOrdersByLocation(sell, stationFilter),
    [sell, stationFilter]
  );
  const filteredBuy = useMemo(
    () => filterOrdersByLocation(buy, stationFilter),
    [buy, stationFilter]
  );
  const sortedSell = useMemo(
    () => [...filteredSell].sort((a, b) => a.price - b.price),
    [filteredSell]
  );
  const sortedBuy = useMemo(
    () => [...filteredBuy].sort((a, b) => b.price - a.price),
    [filteredBuy]
  );
  const sellRows = sellShowAll ? sortedSell : sortedSell.slice(0, ROW_CAP);
  const buyRows = buyShowAll ? sortedBuy : sortedBuy.slice(0, ROW_CAP);

  const stationFilterLabel = useMemo(() => {
    if (stationFilter === null || !orderBookResult) return null;
    const order = orderBookResult.orders.find((o) => o.location_id === stationFilter);
    if (!order) return null;
    const location = resolveOrderLocation(order, npcStationMap, solarSystemMap);
    return formatOrderLocationText(location, t('market.unknownStructure'));
  }, [stationFilter, orderBookResult, npcStationMap, solarSystemMap, t]);

  const baseColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => [
      {
        id: 'price',
        header: t('market.price'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => formatIsk(o.price, 2),
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
    [t, npcStationMap, solarSystemMap]
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
    setExpandedIds((current) => {
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
  function navigateTo(typeId: number | null, next: MarketLocationParam) {
    setSearchParams(buildMarketParams(typeId, next));
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
    // Manual refresh must bypass getOrderBook's 300s TTL cache (CONTEXT.md
    // "Data Age": refresh happens on app open + manual button only).
    clearOrderBookCache();
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
      />
    );
  }

  const catalogueLoading =
    !catalogueError &&
    (!groups || !types || !npcStations || !solarSystems || !marketRegions || !globalMarkets);
  const selectedItem = types?.find((ty) => ty.typeId === selectedTypeId) ?? null;
  const showBackControl = !isDesktop && selectedTypeId !== null;
  // The Data Age badge reflects the order book, so it only belongs on the
  // Market Data tab — showing it while Price History is open would misreport
  // the history's own fetch time as the order book's.
  const itemPanelActions =
    showBackControl || (itemTab === 'orders' && orderBookResult) ? (
      <>
        {showBackControl && (
          <Button size="sm" onClick={handleBackToFinder}>
            {t('market.backToFinder')}
          </Button>
        )}
        {itemTab === 'orders' && orderBookResult && (
          <DataAgeBadge date={new Date(orderBookResult.fetchedAt)} />
        )}
      </>
    ) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('market.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('market.locationMode')} className="flex gap-1.5">
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
          {effectiveLocation.mode === 'hub' ? (
            <label className="flex items-center gap-2 text-xs">
              <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('market.tradeHub')}
              </span>
              <select
                value={effectiveHub.id}
                onChange={(e) => handleHubChange(e.target.value as TradeHub['id'])}
                className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
              >
                {TRADE_HUBS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.systemName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs">
              <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('market.region')}
              </span>
              <select
                value={chosenRegionId}
                onChange={(e) => handleRegionChange(Number(e.target.value))}
                className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
              >
                {(marketRegions ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={selectedTypeId === null || orderBookLoading}
          >
            {t('market.refresh')}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Panel className={isDesktop || selectedTypeId === null ? '' : 'hidden'}>
          <input
            ref={searchInputRef}
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder={t('market.searchPlaceholder')}
            aria-label={t('market.searchLabel')}
            className="h-9 w-full rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
          />

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
            <p className="pt-3 text-xs text-text-dim">{t('market.noResults')}</p>
          ) : (
            <div className="mt-3 border-t border-line pt-2">
              <MarketGroupTree
                groups={groups ?? []}
                childrenByParent={childrenByParent}
                typesByGroup={typesByGroup}
                filterResult={filterResult}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                onSelect={handleSelectItem}
                selectedTypeId={selectedTypeId}
                blueprintCatalog={blueprintCatalog}
                onRequestBlueprintCatalog={ensureBlueprintCatalog}
                onAddToQuickbar={handleAddToQuickbar}
                quickbarAvailable={activeCharacterId !== null}
              />
            </div>
          )}

          <QuickbarList
            items={quickbarItems}
            selectedTypeId={selectedTypeId}
            onSelect={handleSelectItem}
            onRemove={handleRemoveFromQuickbar}
            onReorder={handleReorderQuickbar}
          />
        </Panel>

        <Panel
          className={isDesktop || selectedTypeId !== null ? '' : 'hidden'}
          title={selectedItem?.name}
          padded={selectedTypeId === null}
          actions={itemPanelActions}
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
              ) : orderBookLoading && !orderBookResult ? (
                <div className="flex justify-center py-8">
                  <Spinner label={t('common.loading')} />
                </div>
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
                      <h2 className="px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        {t('market.sell')}
                      </h2>
                      {sortedSell.length === 0 ? (
                        <EmptyState
                          title={t('market.emptySellTitle')}
                          hint={
                            stationFilter !== null
                              ? t('market.emptyFilteredHint')
                              : t('market.emptySellHint')
                          }
                          className="py-6"
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
                      <h2 className="px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        {t('market.buy')}
                      </h2>
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
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      {compareCount > 0 && (
        <CompareDrawer
          chosenRegionId={chosenRegionId}
          globalMarkets={globalMarketsMap}
          locationMode={locationModeValue.mode}
          hubStationId={hub.stationId}
          refreshTick={refreshTick}
        />
      )}
    </div>
  );
}
