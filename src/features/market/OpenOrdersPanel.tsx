import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  InfoTooltip,
  Panel,
  ReauthBanner,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { TRADE_HUBS } from '@/market/hubs';
import { downloadCsv } from '@/lib/downloadCsv';
import { ordersCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrder } from '@/esi/endpoints';
import type { HubAggregate } from '@/market/fuzzwork';
import type { CompetingOrder } from '@/engine/market/undercut';
import { MarketItemLink } from './MarketItemLink';
import { loadAllCharactersOpenOrders, type OpenOrdersSnapshot } from './openOrdersData';
import { loadOrderCostBases, type OrderCostBasis } from './orderCostBasis';
import {
  loadStationBestPrices,
  loadRegionCompetition,
  loadJumpsBetween,
  type RegionCompetition,
} from './orderCompetition';
import { loadPriceHistory, type PriceHistoryResult } from './priceHistory';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import {
  buildOpenOrderRows,
  groupOpenOrders,
  needsAttentionCount,
  openOrderProblemCounts,
  summariseOrderGroup,
  type OpenOrderGroupSummary,
  type CharacterSkills,
  type OpenOrderRow,
} from './openOrdersModel';
import {
  EMPTY_OPEN_ORDERS_FILTER,
  filterOpenOrders,
  sortOpenOrders,
  activeFilterChips,
  type OpenOrdersFilter,
  type OpenOrdersSort,
} from './openOrdersFilter';
import { ORDER_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';
import { stationPriceKey } from './stationPriceKey';
import { OrderBadgeLegend } from './OrderBadgeLegend';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import { OrderDetailModal } from './OrderDetailModal';

/** Healthy orders start collapsed (CONTEXT.md redesign) — the `showHealthy` toggle is the way back, not the funnel filter. */
const DEFAULT_FILTER: OpenOrdersFilter = { ...EMPTY_OPEN_ORDERS_FILTER, hideHealthy: true };

const SORTS: readonly OpenOrdersSort[] = [
  'worstFirst',
  'expirySoonest',
  'iskTiedUp',
  'item',
  'character',
];

/** Every problem worth a funnel chip — every `OrderProblem` except `healthy`, which the fold toggle already covers. */
const PROBLEM_FILTER_OPTIONS: readonly OrderProblem[] = ORDER_PROBLEMS.filter(
  (problem) => problem !== 'healthy'
);

/** The five NPC trade hub stations — an order anywhere else sees far fewer buyers, which the row says out loud. */
const HUB_STATION_IDS = new Set(TRADE_HUBS.map((hub) => hub.stationId));

/**
 * The left edge stripe on a group header, by how bad the group is. Same
 * severity ladder the badges use (`OrderProblemBadge`'s `KIND_TONE`), so a
 * group and the badges inside it can never disagree about how alarming they
 * look. Colour is never the only signal here — the header always carries its
 * own words and count (DESIGN.md §7).
 */
const GROUP_ACCENT: Record<OrderProblem, string> = {
  belowFloor: 'border-l-danger',
  undercutStation: 'border-l-danger',
  undercutSystem: 'border-l-warning',
  undercutRegion: 'border-l-accent',
  expiringOrStale: 'border-l-line',
  outbid: 'border-l-line',
  healthy: 'border-l-success',
};

const EXPIRING_WITHIN_DAY_OPTIONS = [3, 7, 14, 30] as const;
const MIN_ISK_TIED_UP_OPTIONS = [10_000_000, 100_000_000, 1_000_000_000] as const;

interface Snapshot {
  openOrders: OpenOrdersSnapshot;
  typeNames: Map<number, string>;
  /**
   * NPC station lookup — a location absent here is a player structure, but
   * ONLY when `stationsLoaded` is true. `public/data/market/stations.json`
   * is deliberately excluded from the install precache (loadMarketSde.ts),
   * so a first offline visit to this tab can legitimately fail to load it —
   * that must read as "not checked" (`scopeNotChecked`), never as the false
   * claim "this is a player structure" (`structureMarketUnavailable`).
   */
  npcStations: Map<number, { name: string; systemId: number }>;
  stationsLoaded: boolean;
  /** Keyed `${locationId}:${typeId}`. */
  stationPrices: Map<string, HubAggregate>;
  costBases: Map<number, OrderCostBasis>;
  skillsByCharacter: Map<number, CharacterSkills>;
  now: number;
}

function itemKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

async function loadOpenOrdersSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const now = Date.now();
  const openOrders = await loadAllCharactersOpenOrders();

  const typeIds = new Set<number>();
  const requestsByStation = new Map<number, Set<number>>();
  const orderIdsByCharacter = new Map<number, number[]>();
  for (const entry of openOrders.entries) {
    const ids: number[] = [];
    for (const order of entry.orders) {
      typeIds.add(order.type_id);
      ids.push(order.order_id);
      const set = requestsByStation.get(order.location_id) ?? new Set<number>();
      set.add(order.type_id);
      requestsByStation.set(order.location_id, set);
    }
    orderIdsByCharacter.set(entry.characterId, ids);
  }

  // Already superseded: skip every follow-up fetch, their results would be discarded.
  if (signal.cancelled) {
    return {
      openOrders,
      typeNames: new Map(),
      npcStations: new Map(),
      stationsLoaded: false,
      stationPrices: new Map(),
      costBases: new Map(),
      skillsByCharacter: new Map(),
      now,
    };
  }

  const [typeNames, npcStationsSettled, stationPrices] = await Promise.all([
    loadTypeNames([...typeIds]),
    // Caught here, not left to reject the whole `Promise.all`: this file is
    // deliberately excluded from the install precache (loadMarketSde.ts), so
    // a first offline visit can legitimately fail to fetch it. `ok: false`
    // is threaded through as `stationsLoaded` so the panel/modal render "not
    // checked" rather than quietly treating every order as an unresolved
    // player structure.
    loadNpcStations().then(
      (entries): { ok: true; entries: NpcStationEntry[] } => ({ ok: true, entries }),
      (): { ok: false; entries: NpcStationEntry[] } => ({ ok: false, entries: [] })
    ),
    loadStationBestPrices(
      [...requestsByStation.entries()].map(([stationId, ids]) => ({
        stationId,
        typeIds: [...ids],
      }))
    ),
  ]);

  const npcStations = new Map(
    npcStationsSettled.entries.map((s) => [s.id, { name: s.name, systemId: s.systemId }] as const)
  );
  const stationsLoaded = npcStationsSettled.ok;

  const costBases = new Map<number, OrderCostBasis>();
  await Promise.all(
    openOrders.entries.map(async (entry) => {
      const ids = orderIdsByCharacter.get(entry.characterId) ?? [];
      const map = await loadOrderCostBases(entry.characterId, ids);
      for (const [orderId, basis] of map) costBases.set(orderId, basis);
    })
  );

  const skillsByCharacter = new Map<number, CharacterSkills>();
  await mapWithConcurrencyLimit(openOrders.entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const corrected = await loadCorrectedSkills(entry.characterId, now);
    skillsByCharacter.set(entry.characterId, {
      accountingLevel: corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0,
      brokerRelationsLevel: corrected.trained.get(SKILL_IDS.brokerRelations)?.level ?? 0,
    });
  });

  return {
    openOrders,
    typeNames,
    npcStations,
    stationsLoaded,
    stationPrices,
    costBases,
    skillsByCharacter,
    now,
  };
}

interface ActiveChipDisplay {
  id: string;
  label: string;
  clear: () => void;
}

/** Market's Open Orders tab: every selling character's open market orders, worklisted by problem. */
export function OpenOrdersPanel() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadOpenOrdersSnapshot,
    undefined,
    { cacheKey: 'market:open-orders' }
  );

  const [filter, setFilter] = useState<OpenOrdersFilter>(DEFAULT_FILTER);
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [deepByKey, setDeepByKey] = useState<Map<string, RegionCompetition>>(new Map());
  const [deepLoadingKeys, setDeepLoadingKeys] = useState<ReadonlySet<string>>(new Set());
  const [jumpsByPair, setJumpsByPair] = useState<Map<string, JumpsAwayResult>>(new Map());
  const [historyByKey, setHistoryByKey] = useState<Map<string, PriceHistoryResult>>(new Map());
  const [historyLoadingKeys, setHistoryLoadingKeys] = useState<ReadonlySet<string>>(new Set());

  const snapshot = data;

  /**
   * The shared body behind both `ensureDeepChecked` (one row's "Details") and
   * `checkGroupDeeper` (a whole group at once) — returning the underlying
   * promise, rather than firing-and-forgetting like the old single-item
   * helper did, is what lets `checkGroupDeeper` route every item in a group
   * through `mapWithConcurrencyLimit`: a worker there only picks up its next
   * item once the promise for the current one settles, which is exactly what
   * caps the fan-out. In-flight de-duplication (`deepByKey`/`deepLoadingKeys`)
   * and per-item failure isolation (the `.catch` below) both still apply.
   */
  function loadDeepIfNeeded(regionId: number, typeId: number): Promise<void> {
    const key = itemKey(regionId, typeId);
    if (deepByKey.has(key) || deepLoadingKeys.has(key)) return Promise.resolve();
    setDeepLoadingKeys((prev) => new Set(prev).add(key));
    return loadRegionCompetition(regionId, typeId)
      .then((result) => {
        setDeepByKey((prev) => new Map(prev).set(key, result));
      })
      .catch(() => {
        // Left uncached on failure so the next open/press retries.
      })
      .finally(() => {
        setDeepLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  }

  function ensureDeepChecked(regionId: number, typeId: number) {
    void loadDeepIfNeeded(regionId, typeId);
  }

  /**
   * Price history for the modal's "sells out in" chip — fetched on demand,
   * the same on-open pattern as `ensureDeepChecked`, and left uncached on
   * failure so the next open retries. Single-item, so no fan-out cap is
   * needed here (unlike the deep check, this never runs for a whole group).
   */
  function ensureHistoryLoaded(regionId: number, typeId: number) {
    const key = itemKey(regionId, typeId);
    if (historyByKey.has(key) || historyLoadingKeys.has(key)) return;
    setHistoryLoadingKeys((prev) => new Set(prev).add(key));
    void loadPriceHistory(regionId, typeId)
      .then((result) => {
        setHistoryByKey((prev) => new Map(prev).set(key, result));
      })
      .catch(() => {
        // Left uncached on failure so the next open retries.
      })
      .finally(() => {
        setHistoryLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  }

  const deepCompetitionByOrderId = useMemo(() => {
    const m = new Map<number, { competitors: readonly CompetingOrder[]; truncated: boolean }>();
    if (!snapshot) return m;
    for (const entry of snapshot.openOrders.entries) {
      for (const order of entry.orders) {
        const rc = deepByKey.get(itemKey(order.region_id, order.type_id));
        if (rc) m.set(order.order_id, { competitors: rc.competitors, truncated: rc.truncated });
      }
    }
    return m;
  }, [snapshot, deepByKey]);

  const stationNames = useMemo(() => {
    const m = new Map<number, string>();
    if (!snapshot) return m;
    for (const [locationId, station] of snapshot.npcStations) m.set(locationId, station.name);
    return m;
  }, [snapshot]);

  const allRows = useMemo(() => {
    if (!snapshot) return [];
    return buildOpenOrderRows({
      snapshot: snapshot.openOrders,
      typeNames: snapshot.typeNames,
      stationPrices: snapshot.stationPrices,
      costBases: snapshot.costBases,
      deepCompetition: deepCompetitionByOrderId,
      stationNames,
      skillsByCharacter: snapshot.skillsByCharacter,
      now: snapshot.now,
    });
  }, [snapshot, deepCompetitionByOrderId, stationNames]);

  const problemCounts = useMemo(() => openOrderProblemCounts(allRows), [allRows]);

  const visibleRows = useMemo(
    () => sortOpenOrders(filterOpenOrders(allRows, filter), filter.sort),
    [allRows, filter]
  );
  // Healthy orders are FOLDED, not filtered out (CONTEXT.md): grouping always
  // sees every row that matches every filter but `hideHealthy`, so the
  // healthy group's own heading and count still render — just without its
  // table — while `hideHealthy` is on. Using `visibleRows` here instead would
  // make the group vanish outright, which reads as "nothing matched" rather
  // than "nothing here needs you."
  const groupingRows = useMemo(
    () => sortOpenOrders(filterOpenOrders(allRows, { ...filter, hideHealthy: false }), filter.sort),
    [allRows, filter]
  );
  const groups = useMemo(() => groupOpenOrders(groupingRows), [groupingRows]);
  const groupSummaries = useMemo(
    () => new Map(groups.map((group) => [group.problem, summariseOrderGroup(group.rows)])),
    [groups]
  );

  const attentionCount = useMemo(() => needsAttentionCount(allRows), [allRows]);

  const attentionByCharacter = useMemo(() => {
    const m = new Map<number, number>();
    for (const characterId of new Set(allRows.map((r) => r.characterId))) {
      m.set(characterId, needsAttentionCount(allRows.filter((r) => r.characterId === characterId)));
    }
    return m;
  }, [allRows]);

  const entriesWithOrders = useMemo(
    () => snapshot?.openOrders.entries.filter((e) => e.orders.length > 0) ?? [],
    [snapshot]
  );
  const showCharacterStrip = entriesWithOrders.length > 1;

  const characterNamesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const entry of entriesWithOrders) m.set(entry.characterId, entry.characterName);
    return m;
  }, [entriesWithOrders]);

  const ordersByOrderId = useMemo(() => {
    const m = new Map<number, MarketOrder>();
    if (!snapshot) return m;
    for (const entry of snapshot.openOrders.entries) {
      for (const order of entry.orders) m.set(order.order_id, order);
    }
    return m;
  }, [snapshot]);

  const nameFor = (typeId: number) => snapshot?.typeNames.get(typeId) ?? `Type #${typeId}`;

  const reauthEntries = useMemo(
    () => snapshot?.openOrders.entries.filter((e) => e.needsReauth) ?? [],
    [snapshot]
  );
  const fromCacheAny = snapshot?.openOrders.entries.some((e) => e.fromCache) ?? false;
  const oldestFetchedAt = useMemo(() => {
    const times = (snapshot?.openOrders.entries ?? []).map((e) => e.fetchedAt).filter((t) => t > 0);
    return times.length > 0 ? Math.min(...times) : null;
  }, [snapshot]);

  const detailRow =
    detailOrderId !== null ? (allRows.find((r) => r.orderId === detailOrderId) ?? null) : null;

  // Region jumps for the currently open row's region rival, once one exists.
  useEffect(() => {
    if (!detailRow || !snapshot) return;
    const rival = detailRow.deepUndercut?.byScope.region;
    if (!rival) return;
    const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
    if (mySystemId === undefined) return;
    const pairKey = `${mySystemId}:${rival.systemId}`;
    if (jumpsByPair.has(pairKey)) return;
    void loadJumpsBetween(mySystemId, rival.systemId).then((result) => {
      setJumpsByPair((prev) => new Map(prev).set(pairKey, result));
    });
  }, [detailRow, snapshot, jumpsByPair]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (error || !snapshot) {
    return <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  }

  const visibleChips: ActiveChipDisplay[] = activeFilterChips(filter)
    .filter((chip) => chip.id !== 'hideHealthy')
    .map((chip) => ({
      id: chip.id,
      label: chipLabel(chip, characterNamesById, t),
      clear: () => setFilter(chip.clear(filter)),
    }));

  const skipped = snapshot.openOrders.skipped;

  const csvOrders = visibleRows
    .map((r) => ordersByOrderId.get(r.orderId))
    .filter((o): o is MarketOrder => o !== undefined);

  function openDetails(row: OpenOrderRow) {
    setDetailOrderId(row.orderId);
    ensureDeepChecked(row.regionId, row.typeId);
    ensureHistoryLoaded(row.regionId, row.typeId);
  }

  /**
   * Fans out over the group's DISTINCT items (not rows — several characters
   * can each hold an order on the same item) at most `ESI_FANOUT_CONCURRENCY`
   * at a time, rather than firing every region-book fetch in the group at
   * once: a large "expiring or stale" group can easily hold dozens of
   * distinct items.
   */
  function checkGroupDeeper(rows: readonly OpenOrderRow[]) {
    const seen = new Set<string>();
    const uniqueRows: OpenOrderRow[] = [];
    for (const row of rows) {
      const key = itemKey(row.regionId, row.typeId);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRows.push(row);
    }
    void mapWithConcurrencyLimit(uniqueRows, ESI_FANOUT_CONCURRENCY, (row) =>
      loadDeepIfNeeded(row.regionId, row.typeId)
    );
  }

  const columns: DataTableColumn<OpenOrderRow>[] = [
    {
      id: 'item',
      header: t('orders.item'),
      primary: true,
      sortValue: (row) => row.typeName,
      render: (row) => (
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1">
            <MarketItemLink typeId={row.typeId}>{row.typeName}</MarketItemLink>
            {showCharacterStrip && <CharacterBadge characterName={row.characterName} t={t} />}
          </span>
          {/*
            What the floor column is reading from, said on the row that owns
            it. Without this an order with no linked build shows an em-dash
            under "Never sell below" and nothing anywhere explains why — the
            single most confusing thing on the page for a player who has not
            linked any builds yet.
          */}
          {!row.isBuyOrder && (
            <span className="text-[0.6875rem] text-text-dim">
              {/*
                Not the run's id: `ProductionRunRecord.id` is an opaque
                storage key, and there is no user-facing run number to show.
              */}
              {row.costBasis ? t('market.orders.buildLinked') : t('market.orders.noBuildLinked')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'where',
      header: t('market.location'),
      className: 'text-text-dim',
      render: (row) => (
        <span className="flex flex-col gap-0.5">
          <span>{row.stationName ?? t('market.unknownStructure')}</span>
          {/*
            Only ever claimed for a location this app actually resolved: an
            unresolved player structure is "not checked", not "off hub".
          */}
          {row.stationName !== null && !HUB_STATION_IDS.has(row.locationId) && (
            <span className="flex items-center gap-1 text-[0.6875rem] text-warning">
              {t('market.orders.offHub')}
              <InfoTooltip
                label={t('common.aboutLabel', { label: t('market.orders.offHub') })}
                content={t('market.orders.offHubHelp')}
              />
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'price',
      header: t('orders.price'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.price,
      render: (row) => formatIsk(row.price, 2),
    },
    {
      id: 'problem',
      header: t('market.orders.filter.problem'),
      render: (row) => {
        const badge = orderBadgeFor(row);
        return (
          <span className="flex flex-col items-start gap-1">
            {badge && <OrderProblemBadge kind={badge.kind} detail={badge.detail} />}
            <OrderRowSummaryText row={row} />
          </span>
        );
      },
    },
    {
      id: 'floor',
      header: t('market.orders.floorLabel'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.floor?.relist,
      render: (row) => (row.floor ? formatIsk(row.floor.relist, 2) : t('common.unknown')),
    },
    {
      id: 'remaining',
      header: t('orders.remaining'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.volumeRemain,
      render: (row) => `${row.volumeRemain.toLocaleString()} / ${row.volumeTotal.toLocaleString()}`,
    },
    {
      id: 'expires',
      header: t('orders.expires'),
      className: 'whitespace-nowrap text-text-dim',
      sortValue: (row) => row.expiry?.expiresAt,
      render: (row) =>
        row.expiry ? new Date(row.expiry.expiresAt).toLocaleDateString() : t('common.unknown'),
    },
    {
      id: 'details',
      header: t('market.orders.details'),
      render: (row) => (
        <Button size="sm" onClick={() => openDetails(row)}>
          {t('market.orders.details')}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      padded={false}
      actions={
        <span className="flex items-center gap-2">
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('orders.refresh')}
            onClick={refresh}
          />
          <IconButton
            size="sm"
            icon={<Icon.Download />}
            label={t('orders.exportCsvOpen')}
            disabled={csvOrders.length === 0}
            onClick={() => downloadCsv('orders-open', csvOrders, ordersCsvColumns(t, nameFor))}
          />
          {oldestFetchedAt !== null && <DataAgeBadge date={new Date(oldestFetchedAt)} />}
        </span>
      }
    >
      <div className="space-y-2 px-3 pt-2">
        {allRows.length > 0 && (
          <p className="text-xs text-text-dim">
            {[
              showCharacterStrip
                ? t('market.orders.headerCharacters', { count: entriesWithOrders.length })
                : null,
              t('market.orders.headerSummary', { count: allRows.length }),
              t('market.orders.headerAttention', { count: attentionCount }),
            ]
              .filter((part): part is string => part !== null)
              .join(' \u00b7 ')}
          </p>
        )}
        {reauthEntries.map((entry) => (
          <ReauthBanner
            key={entry.characterId}
            variant="ghost"
            title={`${entry.characterName} — ${t('orders.reauthTitle')}`}
            hint={t('orders.reauthHint')}
            actionLabel={t('orders.reauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        ))}
        {fromCacheAny && (
          <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
        )}
        {skipped.map((s) => (
          <p key={s.characterId} className="text-xs text-text-dim">
            {s.name} — {t('market.orders.characterNotShared')}
          </p>
        ))}
      </div>

      {reauthEntries.length === 0 && allRows.length === 0 ? (
        <EmptyState title={t('orders.emptyTitle')} hint={t('orders.emptyHint')} className="py-8" />
      ) : (
        <>
          <div className="border-b border-line px-3 py-2">
            <FilterBar
              value={filter}
              onChange={setFilter}
              // A chip per problem plus three selects is two full rows above
              // the worklist they exist to narrow, so the whole box lives
              // behind the funnel at every width here. The active chips stay
              // outside it, where they can be seen and dropped.
              collapsible
              activeCount={visibleChips.length}
              search={
                <SearchInput
                  value={filter.text}
                  onChange={(event) => setFilter({ ...filter, text: event.target.value })}
                  placeholder={t('orders.searchPlaceholder')}
                  className="min-w-48 flex-1"
                />
              }
            >
              {(draft, setDraft) => (
                <>
                  <FilterChip
                    label={t('orders.buy')}
                    selected={draft.side === 'buy'}
                    onToggle={() =>
                      setDraft({ ...draft, side: draft.side === 'buy' ? null : 'buy' })
                    }
                  />
                  <FilterChip
                    label={t('orders.sell')}
                    selected={draft.side === 'sell'}
                    onToggle={() =>
                      setDraft({ ...draft, side: draft.side === 'sell' ? null : 'sell' })
                    }
                  />
                  {PROBLEM_FILTER_OPTIONS.map((problem) => {
                    const count = problemCounts[problem];
                    const selected = draft.problems.includes(problem);
                    return (
                      <FilterChip
                        key={problem}
                        label={t(`market.orders.group.${problem}`)}
                        count={count}
                        selected={selected}
                        // A zero-count problem still renders (dimmed via
                        // className, still a real focusable button) — the
                        // player can see it's clean rather than wonder where
                        // it went, per the ticket.
                        className={count === 0 ? 'opacity-50' : undefined}
                        onToggle={() =>
                          setDraft({
                            ...draft,
                            problems: selected
                              ? draft.problems.filter((p) => p !== problem)
                              : [...draft.problems, problem],
                          })
                        }
                      />
                    );
                  })}
                  <FilterChip
                    label={t('market.orders.filter.costBasisLinked')}
                    selected={draft.costBasis === 'linked'}
                    onToggle={() =>
                      setDraft({
                        ...draft,
                        costBasis: draft.costBasis === 'linked' ? null : 'linked',
                      })
                    }
                  />
                  <FilterChip
                    label={t('market.orders.filter.costBasisMissing')}
                    selected={draft.costBasis === 'missing'}
                    onToggle={() =>
                      setDraft({
                        ...draft,
                        costBasis: draft.costBasis === 'missing' ? null : 'missing',
                      })
                    }
                  />
                  <Select
                    value={
                      draft.expiringWithinDays === null ? 'any' : String(draft.expiringWithinDays)
                    }
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        expiringWithinDays: value === 'any' ? null : Number(value),
                      })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.orders.filter.expiringWithin')}
                      className="w-36"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('market.orders.filter.none')}</SelectItem>
                      {EXPIRING_WITHIN_DAY_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {t('market.orders.filter.expiringWithinOption', { count: days })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.minIskTiedUp === null ? 'any' : String(draft.minIskTiedUp)}
                    onValueChange={(value) =>
                      setDraft({ ...draft, minIskTiedUp: value === 'any' ? null : Number(value) })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.orders.filter.minIskTiedUp')}
                      className="w-36"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('market.orders.filter.none')}</SelectItem>
                      {MIN_ISK_TIED_UP_OPTIONS.map((amount) => (
                        <SelectItem key={amount} value={String(amount)}>
                          {t('market.orders.filter.minIskTiedUpOption', {
                            amount: formatIskCompact(amount),
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.sort}
                    onValueChange={(value) => setDraft({ ...draft, sort: value as OpenOrdersSort })}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.orders.filter.sort')}
                      className="w-40"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORTS.map((sort) => (
                        <SelectItem key={sort} value={sort}>
                          {t(`market.orders.filter.sort${sort[0].toUpperCase()}${sort.slice(1)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </FilterBar>
          </div>

          {visibleChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              {visibleChips.map((chip) => (
                <FilterChip key={chip.id} label={chip.label} selected onToggle={chip.clear} />
              ))}
              <button
                type="button"
                className="text-xs text-text-dim underline hover:text-text"
                onClick={() => setFilter(DEFAULT_FILTER)}
              >
                {t('market.orders.filter.clearAll')}
              </button>
            </div>
          )}

          {showCharacterStrip && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <FilterChip
                label={t('market.orders.allCharacters')}
                selected={filter.characterIds.length === 0}
                onToggle={() => setFilter({ ...filter, characterIds: [] })}
              />
              {entriesWithOrders.map((entry) => (
                <FilterChip
                  key={entry.characterId}
                  label={entry.characterName}
                  count={attentionByCharacter.get(entry.characterId) ?? 0}
                  selected={filter.characterIds.includes(entry.characterId)}
                  onToggle={() => setFilter({ ...filter, characterIds: [entry.characterId] })}
                />
              ))}
            </div>
          )}

          <p className="px-3 pt-2 text-xs text-text-dim">
            {t('market.orders.filter.matchCount', {
              count: visibleRows.length,
              total: allRows.length,
            })}
          </p>

          {groups.length === 0 ? (
            <EmptyState title={t('orders.noResults')} className="py-8" />
          ) : (
            groups.map((group) => {
              const folded = group.problem === 'healthy' && filter.hideHealthy;
              return (
                <div key={group.problem} data-testid={`order-group-${group.problem}`}>
                  <div
                    className={cx(
                      'flex items-start justify-between gap-2 border-l-2 bg-panel-2 px-3 py-2',
                      GROUP_ACCENT[group.problem]
                    )}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                        {t(`market.orders.group.${group.problem}`)} · {group.rows.length}
                      </span>
                      {/*
                        What the group holds, said in the header rather than
                        inside a "?" tooltip, so a folded or long group can be
                        judged without opening it: what the group means, then
                        the ISK at stake, the worst gap in it, and whose
                        orders they are.
                      */}
                      <span className="text-[0.6875rem] text-text-dim">
                        {groupHeaderLine(group.problem, groupSummaries.get(group.problem), {
                          showCharacters: showCharacterStrip,
                          t,
                        })}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {group.problem === 'healthy' && (
                        <button
                          type="button"
                          className="text-xs text-accent underline hover:text-text"
                          onClick={() => setFilter({ ...filter, hideHealthy: !filter.hideHealthy })}
                        >
                          {t(
                            filter.hideHealthy
                              ? 'market.orders.showHealthy'
                              : 'market.orders.hideHealthy'
                          )}
                        </button>
                      )}
                      {!folded && (
                        <IconButton
                          size="sm"
                          variant="plain"
                          icon={<Icon.Route />}
                          label={t('market.orders.checkDeeper')}
                          onClick={() => checkGroupDeeper(group.rows)}
                        />
                      )}
                    </span>
                  </div>
                  {folded ? (
                    <p className="px-3 py-2 text-xs text-text-dim">
                      {t('market.orders.group.healthyHint')}
                    </p>
                  ) : (
                    <DataTable
                      columns={columns}
                      rows={group.rows}
                      rowKey={(row) => row.orderId}
                      label={`${t(`market.orders.group.${group.problem}`)} · ${group.rows.length}`}
                    />
                  )}
                </div>
              );
            })
          )}

          <div className="flex flex-wrap items-center gap-3 px-3 py-2">
            <button
              type="button"
              className="text-xs text-text-dim underline hover:text-text"
              onClick={() => setLegendOpen(true)}
            >
              {t('market.orders.legendOpen')}
            </button>
          </div>
        </>
      )}

      {detailRow && (
        <OrderDetailModal
          open={detailOrderId !== null}
          row={detailRow}
          skills={snapshot.skillsByCharacter.get(detailRow.characterId)}
          deep={deepByKey.get(itemKey(detailRow.regionId, detailRow.typeId)) ?? null}
          loadingDeep={deepLoadingKeys.has(itemKey(detailRow.regionId, detailRow.typeId))}
          history={historyByKey.get(itemKey(detailRow.regionId, detailRow.typeId)) ?? null}
          stationChecked={snapshot.stationPrices.has(
            stationPriceKey(detailRow.locationId, detailRow.typeId)
          )}
          stationsLoaded={snapshot.stationsLoaded}
          regionJumps={(() => {
            const rival = detailRow.deepUndercut?.byScope.region;
            const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
            if (!rival || mySystemId === undefined) return undefined;
            return jumpsByPair.get(`${mySystemId}:${rival.systemId}`);
          })()}
          stationNameFor={(locationId) => snapshot.npcStations.get(locationId)?.name ?? null}
          onCheckDeeper={() => ensureDeepChecked(detailRow.regionId, detailRow.typeId)}
          onClose={() => setDetailOrderId(null)}
        />
      )}
      <OrderBadgeLegend open={legendOpen} onClose={() => setLegendOpen(false)} />
    </Panel>
  );
}

function chipLabel(
  chip: ReturnType<typeof activeFilterChips>[number],
  characterNamesById: ReadonlyMap<number, string>,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const label = t(chip.labelKey);
  if (chip.id === 'text') return `${label}: "${chip.value}"`;
  if (chip.id === 'side')
    return `${label}: ${t(chip.value === 'buy' ? 'orders.buy' : 'orders.sell')}`;
  if (chip.id.startsWith('character:')) {
    const characterId = Number(chip.value);
    return `${label}: ${characterNamesById.get(characterId) ?? chip.value}`;
  }
  if (chip.id.startsWith('problem:')) return `${label}: ${t(`market.orders.group.${chip.value}`)}`;
  if (chip.id === 'costBasis') {
    return `${label}: ${t(chip.value === 'linked' ? 'market.orders.filter.costBasisLinked' : 'market.orders.filter.costBasisMissing')}`;
  }
  if (chip.value !== undefined) return `${label}: ${chip.value}`;
  return label;
}

/**
 * The group header's one-line description: what the group means, how much
 * ISK it holds, the worst gap any row in it carries, and — only when more
 * than one character has orders — who those rows belong to.
 *
 * A missing summary (a group whose rows were filtered out from under it)
 * drops the numbers rather than printing zeroes, and a group with nothing
 * undercut in it drops the gap clause rather than claiming "worst -0.0%".
 */
function groupHeaderLine(
  problem: OrderProblem,
  summary: OpenOrderGroupSummary | undefined,
  {
    showCharacters,
    t,
  }: { showCharacters: boolean; t: (key: string, options?: Record<string, unknown>) => string }
): string {
  const parts: string[] = [t(`market.orders.group.${problem}Hint`)];
  if (summary) {
    parts.push(t('market.orders.groupSummaryIsk', { isk: formatIskCompact(summary.iskTiedUp) }));
    if (summary.worstGapPct !== null) {
      parts.push(t('market.orders.groupSummaryWorst', { pct: summary.worstGapPct.toFixed(1) }));
    }
    if (showCharacters && summary.byCharacter.length > 0) {
      parts.push(summary.byCharacter.map((s) => `${s.characterName} ${s.count}`).join(', '));
    }
  }
  return parts.join(' \u00b7 ');
}
