import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatVolume } from '@/features/market/format';
import {
  splitOrderBook,
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';

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
}

function MarketGroupTree({
  childrenByParent,
  typesByGroup,
  filterResult,
  expandedIds,
  onToggle,
  onSelect,
  selectedTypeId,
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
            {items.map((item) => (
              <li key={item.typeId}>
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
              </li>
            ))}
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
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);

  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);

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
  // "Adjusting state when a prop changes" (react.dev): resets the previous
  // item's row-cap and order book the instant selection changes, in the same
  // render — an Effect would let the old item's rows flash under the new title.
  const [resetForTypeId, setResetForTypeId] = useState<number | null>(null);
  if (selectedTypeId !== resetForTypeId) {
    setResetForTypeId(selectedTypeId);
    setSellShowAll(false);
    setBuyShowAll(false);
    setOrderBookResult(null);
  }

  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

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
  const sortedSell = useMemo(() => [...sell].sort((a, b) => a.price - b.price), [sell]);
  const sortedBuy = useMemo(() => [...buy].sort((a, b) => b.price - a.price), [buy]);
  const sellRows = sellShowAll ? sortedSell : sortedSell.slice(0, ROW_CAP);
  const buyRows = buyShowAll ? sortedBuy : sortedBuy.slice(0, ROW_CAP);

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
              <div className="pb-3">
                <h2 className="px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('market.sell')}
                </h2>
                {sortedSell.length === 0 ? (
                  <EmptyState
                    title={t('market.emptySellTitle')}
                    hint={t('market.emptySellHint')}
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
                    hint={t('market.emptyBuyHint')}
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
