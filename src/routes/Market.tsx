import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button, DataAgeBadge, DataTable, EmptyState, Panel, Spinner } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import {
  loadMarketGroups,
  loadMarketTypes,
  loadNpcStations,
  loadSolarSystems,
} from '@/sde/loadMarketSde';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
} from '@/sde/marketTypes';
import { TRADE_HUBS, DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { filterMarketTree, MARKET_TREE_MATCH_LIMIT } from '@/features/market/marketTree';
import { getOrderBook, clearOrderBookCache } from '@/features/market/orderBook';
import { formatVolume, formatOrderLocationText } from '@/features/market/format';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import {
  splitOrderBook,
  resolveOrderLocation,
  orderExpiry,
  filterOrdersByLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';
import type { MarketFocusSearchState } from '@/lib/shortcuts';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';

/** Debounce for the catalogue search, so a fast typist doesn't re-filter the tree on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** Rows shown per side before "show all" (CONTEXT.md). */
const ROW_CAP = 15;

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
 * live Order Book at the current Trade Hub's region (right), read from ESI
 * (ADR 0003). The catalogue (groups/types/systems/stations) is lazy-loaded,
 * not precached (CONTEXT.md round 10) — most installs never open /market.
 */
export function Market() {
  const { t } = useTranslation();
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);

  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
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
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);

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
  // "Adjusting state when a prop changes" (react.dev): resets the previous
  // item's row-cap, station filter and order book the instant selection or
  // hub changes, in the same render — an Effect would let the old item's (or
  // old hub's) rows flash under the new title.
  const resetKey = `${selectedTypeId ?? 'none'}:${hubId}`;
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
  }, [hydrateHub]);

  // The "jump to search" shortcut (`lib/shortcuts.ts`) navigates here with
  // this state to focus the box in one step, from anywhere in the app.
  useEffect(() => {
    if ((location.state as Partial<MarketFocusSearchState> | null)?.focusSearch) {
      searchInputRef.current?.focus();
    }
  }, [location.state]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadMarketGroups(), loadMarketTypes(), loadNpcStations(), loadSolarSystems()])
      .then(([g, ty, stations, systems]) => {
        if (cancelled) return;
        setGroups(g);
        setTypes(ty);
        setNpcStations(stations);
        setSolarSystems(systems);
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

  // Refetches on selection, hub, or a manual Refresh click. Gated on
  // hubHydrated so this doesn't fire once for the default hub and again once
  // the persisted 'marketHub' setting resolves.
  useEffect(() => {
    if (selectedTypeId === null || !hubHydrated) return;
    let cancelled = false;
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    void (async () => {
      setOrderBookLoading(true);
      const result = await getOrderBook(hub.regionId, selectedTypeId);
      if (cancelled) return;
      setOrderBookResult(result);
      setOrderBookLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, hubId, hubHydrated, refreshTick]);

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

  const { sell, buy } = useMemo(
    () => (orderBookResult ? splitOrderBook(orderBookResult.orders) : { sell: [], buy: [] }),
    [orderBookResult]
  );
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

  const catalogueLoading = !catalogueError && (!groups || !types || !npcStations || !solarSystems);
  const selectedItem = types?.find((ty) => ty.typeId === selectedTypeId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('market.title')}</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.tradeHub')}
            </span>
            <select
              value={hubId}
              onChange={(e) => void setHubId(e.target.value as TradeHub['id'])}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            >
              {TRADE_HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.systemName}
                </option>
              ))}
            </select>
          </label>
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
        <Panel>
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
                onSelect={setSelectedTypeId}
                selectedTypeId={selectedTypeId}
                blueprintCatalog={blueprintCatalog}
                onRequestBlueprintCatalog={ensureBlueprintCatalog}
              />
            </div>
          )}
        </Panel>

        <Panel
          title={selectedItem?.name}
          padded={selectedTypeId === null}
          actions={
            orderBookResult ? (
              <DataAgeBadge date={new Date(orderBookResult.fetchedAt)} />
            ) : undefined
          }
        >
          {selectedTypeId === null ? (
            <EmptyState
              title={t('market.selectPromptTitle')}
              hint={t('market.selectPromptHint')}
              className="py-8"
            />
          ) : orderBookLoading && !orderBookResult ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : (
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
          )}
        </Panel>
      </div>
    </div>
  );
}
