import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
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
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { permissionsForEndpoints } from '@/esi/registry';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { resolveCharacterFilter } from '@/features/character/characterFilterValue';
import { loadReprocessing } from '@/sde/loadSde';
import type { ReprocessingType } from '@/sde/types';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlFilter } from '@/lib/useUrlState';
import { useLazyRowCache } from '@/lib/useLazyRowCache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { cx } from '@/lib/cx';
import { formatIskAuto, formatIskCompact } from '@/lib/isk';
import { TRADE_HUBS } from '@/market/hubs';
import { downloadCsv } from '@/lib/downloadCsv';
import { ordersCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrder } from '@/esi/endpoints';
import type { CompetingOrder } from '@/engine/market/undercut';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import { OpenOrdersList } from './OpenOrdersList';
import { isOffHubStation } from './hubStation';
import { formatOrderFloorPrice, formatOrderRemaining } from './orderRowFormat';
import { loadOpenOrdersSnapshot } from './openOrdersPageSnapshot';
import {
  loadStationBestPrices,
  loadRegionCompetition,
  loadStructureCompetition,
  loadJumpsBetween,
  type RegionCompetition,
  type StructureCompetition,
} from './orderCompetition';
import { loadPriceHistory, type PriceHistoryResult } from './priceHistory';
import { recordOrderProblemSamples, sampleableCharacterIds } from './orderProblemSamples';
import { sampledProblem } from '@/engine/market/orderProblemHistory';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import {
  buildOpenOrderRows,
  groupOpenOrders,
  needsAttentionCount,
  openOrderProblemCounts,
  summariseOrderGroup,
  type OpenOrderGroupSummary,
  type OpenOrderRow,
} from './openOrdersModel';
import {
  EMPTY_OPEN_ORDERS_FILTER,
  FILTERABLE_PROBLEMS,
  filterOpenOrders,
  OPEN_ORDERS_FIELD_TO_PARAM,
  OPEN_ORDERS_FILTER_PARAMS,
  OPEN_ORDERS_SORTS,
  sortOpenOrders,
  activeFilterChips,
  DEFAULT_OPEN_ORDERS_FILTER_PARAMS,
  type OpenOrdersFilter,
  type OpenOrdersSort,
} from './openOrdersFilter';
import type { OrderProblem } from '@/engine/market/orderProblems';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';
import { stationPriceKey } from './stationPriceKey';
import type { HubBuyPrice } from './orderExits';
import { OrderBadgeLegend } from './OrderBadgeLegend';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import { OrderDetailModal } from './OrderDetailModal';
import type { ReprocessingInput } from './orderExits';

/** Healthy orders start collapsed (CONTEXT.md redesign) — the `showHealthy` toggle is the way back, not the funnel filter. */
const DEFAULT_FILTER: OpenOrdersFilter = { ...EMPTY_OPEN_ORDERS_FILTER, hideHealthy: true };

const SORTS: readonly OpenOrdersSort[] = OPEN_ORDERS_SORTS;

/**
 * Every problem worth a funnel chip. The same set a deep link may name, and
 * deliberately the same constant: the funnel and the URL are two ways to reach
 * one filter, and `healthy` is excluded from both for the reason
 * `FILTERABLE_PROBLEMS` gives.
 */
const PROBLEM_FILTER_OPTIONS = FILTERABLE_PROBLEMS;

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

function itemKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`;
}

/** "Jita 4 - Moon 4 - Caldari Navy Assembly Plant" -> "Jita 4"; the full name still shows on hover. */
function stationShortName(name: string): string {
  const dashIndex = name.indexOf(' - ');
  return dashIndex === -1 ? name : name.slice(0, dashIndex);
}

/** The highlighted row's own group always wins over either fold mechanism (decision `20260924-...`, step 9). */
function isGroupFolded(
  problem: OrderProblem,
  highlightedRow: OpenOrderRow | null,
  filter: OpenOrdersFilter,
  collapsedGroups: ReadonlySet<OrderProblem>
): boolean {
  if (problem === highlightedRow?.problem) return false;
  if (problem === 'healthy') return filter.hideHealthy;
  return collapsedGroups.has(problem);
}

interface ActiveChipDisplay {
  id: string;
  label: string;
  clear: () => void;
}

interface OpenOrdersPanelProps {
  /** Same per-item context menu as Transactions: null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

/** Market's Open Orders tab: every selling character's open market orders, worklisted by problem. */
export function OpenOrdersPanel({
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: OpenOrdersPanelProps) {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadOpenOrdersSnapshot,
    undefined,
    { cacheKey: 'market:open-orders' }
  );

  /*
   * The whole filter lives in the URL (ADR 0015), one `orders.*` key per
   * field — a deep link (the Overview board's count tiles, `openOrdersHref`)
   * narrows it on arrival, and every chip, select and search keystroke from
   * here on writes straight back to it, so a reload or a shared link always
   * reopens exactly what was on screen. This page has only the one filter
   * bar, so it never needs `useUrlFilter`'s scope-reset — the scope key
   * never changes.
   */
  const [filter, setFilter] = useUrlFilter<OpenOrdersFilter>(
    'orders',
    OPEN_ORDERS_FILTER_PARAMS,
    OPEN_ORDERS_FIELD_TO_PARAM,
    DEFAULT_OPEN_ORDERS_FILTER_PARAMS
  );
  /**
   * The order a Notification Event (an undercut, or a fill) sent the reader
   * to, spent once on arrival (`useHighlightParam`'s own doc). Landing on the
   * row that prompted the click, decision `20260908-123516`.
   */
  const highlightId = useHighlightParam();
  const isPhone = useIsPhone();
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  /** Groups the player has folded away by hand. `healthy` is never in here — see the toggle below. */
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<OrderProblem>>(
    () => new Set()
  );
  /**
   * Six per-row-expand caches, same `useLazyRowCache` shape — only what
   * differs per one (key, retry policy) is noted below.
   */
  const deepCache = useLazyRowCache<string, RegionCompetition>();
  /**
   * One player structure's market book, keyed by locationId — every order
   * parked at that structure, of any type or character, shares one fetch.
   * Absent means "never attempted or still failing"; `buildOpenOrderRows`
   * and the detail modal both read that absence as "unavailable", same as
   * an ungranted scope or an ACL denial. Loaded `sticky` (below): an
   * ACL-denied (403) structure must not retry on every unrelated snapshot
   * revalidation while the modal stays open — only the modal's "Check
   * deeper" button forces another attempt, via `structureCache.reset`.
   */
  const structureCache = useLazyRowCache<number, StructureCompetition>();
  /** Jump distance between two solar systems, keyed by `"system:system"` — shared by the region-rival lookup and the trade-hub sweep below. */
  const jumpsCache = useLazyRowCache<string, JumpsAwayResult>();
  /**
   * The refine comparison, per opened order: the baked yield for its item
   * plus a price for each material AT THAT STATION. Keyed the same way as
   * the other on-demand caches, and loaded only when a detail modal opens —
   * `reprocessing.json` is 1.4 MB and no row on the worklist needs it.
   */
  const reprocessingCache = useLazyRowCache<
    string,
    { entry: ReprocessingType; materialPrices: Record<number, number> }
  >();
  /**
   * What each trade hub bids for one item, keyed by type id alone: a hub's
   * own buy orders do not change with where the player's stock happens to
   * sit, unlike the refine prices above.
   */
  const hubPricesCache = useLazyRowCache<number, Record<string, number | null>>();
  /** Price history for the modal's "sells out in" chip, keyed by region+item. */
  const historyCache = useLazyRowCache<string, PriceHistoryResult>();

  const snapshot = data;

  /**
   * The shared body behind both `ensureDeepChecked` (one row's "Details") and
   * `checkGroupDeeper` (a whole group at once) — returning the underlying
   * promise, rather than firing-and-forgetting like the old single-item
   * helper did, is what lets `checkGroupDeeper` route every item in a group
   * through `mapWithConcurrencyLimit`: a worker there only picks up its next
   * item once the promise for the current one settles, which is exactly what
   * caps the fan-out. In-flight de-duplication and per-item failure isolation
   * (`deepCache`'s own job now) both still apply.
   */
  function loadDeepIfNeeded(regionId: number, typeId: number): Promise<void> {
    return deepCache.load(itemKey(regionId, typeId), () => loadRegionCompetition(regionId, typeId));
  }

  function ensureDeepChecked(regionId: number, typeId: number) {
    void loadDeepIfNeeded(regionId, typeId);
  }

  /**
   * One player structure's market book, keyed by locationId — every order
   * parked there shares this one fetch. `loadStructureCompetition` never
   * throws (a 403/network failure resolves to `null`), so a `null` result is
   * turned into a rejection here — `structureCache`'s `sticky` option is what
   * actually stops a repeat attempt, but a rejection is what marks it failed
   * and lets a `null` share the same "unavailable" shape as a genuine fetch
   * error.
   *
   * Wrapped in `useCallback` because it is called from the effect below, and
   * only a REFERENTIALLY STABLE function can sit in that effect's dependency
   * array without eslint's exhaustive-deps rule (rightly) demanding the
   * effect re-run on every render. `[structureCache.load]` costs nothing:
   * `load` is itself stable for the life of the `useLazyRowCache` call.
   */
  const ensureStructureChecked = useCallback(
    (characterId: number, locationId: number): void => {
      void structureCache.load(
        locationId,
        async () => {
          const result = await loadStructureCompetition(characterId, locationId);
          if (!result) throw new Error('Structure market unavailable');
          return result;
        },
        { sticky: true }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `structureCache.load` is the only part of `structureCache` read here, and it alone is stable for the life of the `useLazyRowCache` call; listing the whole object would recreate this callback every render, since its `byKey`/`loadingKeys`/`failedKeys` change on every fetch.
    [structureCache.load]
  );

  /**
   * Price history for the modal's "sells out in" chip — fetched on demand,
   * the same on-open pattern as `ensureDeepChecked`, and left uncached on
   * failure so the next open retries. Single-item, so no fan-out cap is
   * needed here (unlike the deep check, this never runs for a whole group).
   */
  function ensureHistoryLoaded(regionId: number, typeId: number) {
    void historyCache.load(itemKey(regionId, typeId), () => loadPriceHistory(regionId, typeId));
  }

  /**
   * The refine comparison for one order, on the same on-open pattern as
   * `ensureHistoryLoaded`.
   *
   * Keyed by station AND item, not by item alone: the material prices are the
   * ones at THIS station, and the same item held at two stations refines into
   * materials worth different amounts. Left uncached on failure so the next
   * open retries. An item with no reprocessing entry caches an empty
   * materials list rather than retrying forever — "this refines into nothing"
   * is an answer.
   */
  function ensureReprocessingLoaded(locationId: number, typeId: number) {
    void reprocessingCache.load(stationPriceKey(locationId, typeId), async () => {
      const map = await loadReprocessing();
      const entry = map[String(typeId)] ?? { portionSize: 1, materials: [] };
      const materialTypeIds = entry.materials.map((m) => m.typeID);
      const materialPrices: Record<number, number> = {};
      if (materialTypeIds.length > 0) {
        const prices = await loadStationBestPrices([
          { stationId: locationId, typeIds: materialTypeIds },
        ]);
        for (const materialTypeId of materialTypeIds) {
          // The best BUY order: this exit sells the materials into orders
          // that already exist, rather than listing them and waiting.
          const buyMax = prices.get(stationPriceKey(locationId, materialTypeId))?.buyMax;
          if (buyMax !== null && buyMax !== undefined) materialPrices[materialTypeId] = buyMax;
        }
      }
      return { entry, materialPrices };
    });
  }

  /**
   * What every trade hub bids for the opened order's item, on the same
   * on-open pattern as the refine comparison. Queried per hub STATION, not
   * per region: a buy order elsewhere in the hub's region carries a range
   * this app does not read and may not reach the hub at all, the same
   * restriction `orderExits` applies to the player's own station.
   */
  function ensureHubPricesLoaded(typeId: number) {
    void hubPricesCache.load(typeId, async () => {
      const prices = await loadStationBestPrices(
        TRADE_HUBS.map((hub) => ({ stationId: hub.stationId, typeIds: [typeId] }))
      );
      const byHub: Record<string, number | null> = {};
      for (const hub of TRADE_HUBS) {
        byHub[hub.id] = prices.get(stationPriceKey(hub.stationId, typeId))?.buyMax ?? null;
      }
      return byHub;
    });
  }

  const deepCompetitionByOrderId = useMemo(() => {
    const m = new Map<number, { competitors: readonly CompetingOrder[]; truncated: boolean }>();
    if (!snapshot) return m;
    for (const entry of snapshot.openOrders.entries) {
      for (const order of entry.orders) {
        const rc = deepCache.byKey.get(itemKey(order.region_id, order.type_id));
        if (rc) m.set(order.order_id, { competitors: rc.competitors, truncated: rc.truncated });
      }
    }
    return m;
  }, [snapshot, deepCache.byKey]);

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
      walletBasisGaps: snapshot.walletBasisGaps,
      deepCompetition: deepCompetitionByOrderId,
      structureCompetition: structureCache.byKey,
      stationNames,
      problemSamples: snapshot.problemSamples,
      skillsByCharacter: snapshot.skillsByCharacter,
      standingsByOrder: snapshot.standingsByOrder,
      now: snapshot.now,
    });
  }, [snapshot, deepCompetitionByOrderId, structureCache.byKey, stationNames]);

  /**
   * The highlighted row, found across every group before any fold/filter
   * narrows the screen — null when nothing matches is harmless (decision
   * `20260908-123516`). Read off `allRows`, not `groupingRows`: this only
   * forces open the row's own fold state, never an active content filter
   * (search/problem/character) — narrowing that too is an open judgment call
   * (see the scope decision file).
   */
  const highlightedRow = useMemo(
    () => (highlightId === null ? null : (allRows.find((r) => r.orderId === highlightId) ?? null)),
    [allRows, highlightId]
  );

  /**
   * Takes this load's `OrderProblem` reading for every open order and drops
   * the history of orders that have since closed. Runs off `allRows` rather
   * than inside the loader because the reading it stores is the
   * classification `buildOpenOrderRows` just produced — nothing earlier in
   * the chain knows it.
   *
   * Re-fires whenever a deeper check reclassifies a row; because every
   * reading from one load shares `snapshot.now`, `appendOrderProblemSample`
   * replaces that load's sample instead of appending a second one, and the
   * spacing guard covers loads further apart. Fire-and-forget: a failed
   * write costs one sample from a deliberately gappy series, not worth an
   * error state on a page whose job is elsewhere.
   */
  useEffect(() => {
    if (!snapshot) return;
    const characterIds = sampleableCharacterIds(snapshot.openOrders.entries);
    void recordOrderProblemSamples(
      allRows.map((row) => ({
        orderId: row.orderId,
        characterId: row.characterId,
        problem: sampledProblem(row.problems),
      })),
      characterIds,
      snapshot.now
    ).catch(() => {});
  }, [snapshot, allRows]);

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
  // No dedup check needed here beyond `jumpsCache.load`'s own — see its doc
  // comment for why that's synchronous and burst-safe on its own.
  useEffect(() => {
    if (!detailRow || !snapshot) return;
    const rival = detailRow.deepUndercut?.byScope.region;
    if (!rival) return;
    const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
    if (mySystemId === undefined) return;
    const pairKey = `${mySystemId}:${rival.systemId}`;
    void jumpsCache.load(pairKey, () => loadJumpsBetween(mySystemId, rival.systemId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `jumpsCache.load` is stable for the life of the `useLazyRowCache` call; `jumpsCache` itself is a fresh object every render (its `byKey` changes on every fetch), so depending on it would run this effect on every render instead of only when `detailRow`/`snapshot` change.
  }, [detailRow, snapshot, jumpsCache.load]);

  // Distance from the opened order to every trade hub. Routes only: a hub's
  // price stands on its own where the origin system is unknown (a player
  // structure), so the rows render with the distance blank rather than not
  // at all. Five pairs, fired in one pass — `jumpsCache.load`'s own
  // synchronous dedup is what keeps that from re-asking for a route already
  // requested this pass, once an earlier one resolves and re-triggers this
  // effect (see its doc comment).
  useEffect(() => {
    if (!detailRow || !snapshot) return;
    const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
    if (mySystemId === undefined) return;
    for (const hub of TRADE_HUBS) {
      const pairKey = `${mySystemId}:${hub.systemId}`;
      void jumpsCache.load(pairKey, () => loadJumpsBetween(mySystemId, hub.systemId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the disable above: `jumpsCache.load` alone is the stable part.
  }, [detailRow, snapshot, jumpsCache.load]);

  /**
   * The currently open row's structure market book (issue #538), once its
   * location is confirmed a player structure. An EFFECT, not a one-shot call
   * from `openDetails`: the NPC-station lookup can still be loading (or have
   * failed) the moment a row is clicked — `stationsLoaded` false at that
   * instant — and only resolve afterward, on a later snapshot. Keying off
   * `detailRow`/`snapshot` means this re-evaluates whenever either changes,
   * including a background refresh landing while the modal stays open,
   * rather than being stuck with nothing left to retry it (the region
   * "Check deeper" button may already be hidden by then, since `deep` can
   * have resolved independently in the meantime).
   *
   * `snapshot` changes on ANY unrelated ESI cache revalidating elsewhere in
   * the app, not just this page's own poll (`useRouteSnapshot`'s app-wide
   * listener) — so this effect fires far more often than "this row's data
   * changed." That's fine: `ensureStructureChecked`'s `sticky` load makes
   * every re-fire after the first a no-op, which is what stops a permanently
   * ACL-denied structure from being retried forever.
   */
  useEffect(() => {
    if (!detailRow || !snapshot?.stationsLoaded) return;
    if (detailRow.stationName !== null) return;
    ensureStructureChecked(detailRow.characterId, detailRow.locationId);
  }, [detailRow, snapshot, ensureStructureChecked]);

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
    ensureReprocessingLoaded(row.locationId, row.typeId);
    ensureHubPricesLoaded(row.typeId);
    // The structure market fetch (issue #538) is NOT triggered here — see
    // the effect below keyed off `detailRow`/`snapshot`, which also covers
    // `stationsLoaded` resolving after this click.
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

  /** `CharacterFilterControl`'s `value` prop, derived the same way from either `filter.characterIds` (desktop strip) or `draft.characterIds` (phone funnel sheet). */
  function characterFilterValueOf(characterIds: readonly number[]) {
    return characterIds.length === 0 ? 'all' : new Set(characterIds);
  }

  /** `CharacterFilterControl`'s `onChange`, resolving its selection back to `characterIds` and handing it to whichever setter owns them — `setFilter` (commits immediately) or `setDraft` (committed on the funnel's Apply). */
  function characterFilterOnChange(setCharacterIds: (ids: readonly number[]) => void) {
    return (next: Parameters<typeof resolveCharacterFilter>[0]) => {
      const resolved = resolveCharacterFilter(next, activeCharacterId);
      setCharacterIds(resolved === 'all' ? [] : [...resolved]);
    };
  }

  /** Same menu Transactions carries — an order row names an item like any other. */
  function rowContextMenu(row: OpenOrderRow, tr: ReactElement) {
    const blueprintTypeID =
      blueprintCatalog === null
        ? undefined
        : (blueprintCatalog.byProductTypeID.get(row.typeId)?.blueprintTypeID ?? null);
    return (
      <ItemContextMenu
        typeId={row.typeId}
        itemName={row.typeName}
        blueprintTypeID={blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onOpenChange={(open) => {
          if (open) onRequestBlueprintCatalog();
        }}
      >
        {tr}
      </ItemContextMenu>
    );
  }

  // On a phone `OpenOrdersList` renders instead of `DataTable` and none of
  // this is used — the ternary short-circuits so the array (8 columns'
  // worth of render closures, rebuilt every render otherwise) is never
  // actually constructed there.
  const columns: DataTableColumn<OpenOrderRow>[] = isPhone
    ? []
    : [
        {
          id: 'item',
          header: t('orders.item'),
          primary: true,
          sortValue: (row) => row.typeName,
          render: (row) => (
            <span className="flex flex-wrap items-center gap-1">
              <MarketItemLink typeId={row.typeId}>{row.typeName}</MarketItemLink>
              {showCharacterStrip && <CharacterBadge characterName={row.characterName} t={t} />}
            </span>
          ),
        },
        {
          id: 'where',
          header: t('market.location'),
          className: 'text-text-dim',
          render: (row) => (
            <span className="flex flex-col gap-0.5">
              <span>
                {row.stationName === null ? (
                  t('market.unknownStructure')
                ) : (
                  <Tooltip content={row.stationName} openOnTap>
                    <span
                      tabIndex={0}
                      className="cursor-help underline decoration-dotted decoration-text-dim/50 underline-offset-2"
                    >
                      {stationShortName(row.stationName)}
                    </span>
                  </Tooltip>
                )}
              </span>
              {isOffHubStation(row.stationName, row.locationId) && (
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
          render: (row) => formatIskAuto(row.price),
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
          // Sorted by the EXACT break-even, unaffected by the rounded-up figure
          // the cell itself renders (issue #1421) — no copy button here, no room
          // in the row (see `OrderDetailModal.tsx` for the copyable version).
          sortValue: (row) => row.floor?.relist,
          render: (row) => (row.floor ? formatOrderFloorPrice(row.floor) : t('common.unknown')),
        },
        {
          id: 'remaining',
          header: t('orders.remaining'),
          align: 'right',
          className: 'tabular-nums',
          sortValue: (row) => row.volumeRemain,
          render: (row) => formatOrderRemaining(row.volumeRemain, row.volumeTotal),
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

  // No VISIBLE order carries a floor (nothing has a linked build), so the
  // whole column would be a wall of dashes — dropped rather than shown
  // empty. Reads `groupingRows`, not `allRows`: a filter (search, problem
  // chip, character) can narrow what's on screen to rows with no floor
  // while some filtered-out row elsewhere still has one, and the column
  // must track what's actually visible, not the character's full order set.
  const hasFloorData = groupingRows.some((row) => row.floor !== null);
  const visibleColumns = columns.filter((column) => column.id !== 'floor' || hasFloorData);

  return (
    <Panel
      padded={false}
      actions={
        <span className="flex items-center gap-2">
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('market.orders.refreshOrders')}
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
            onLogin={() =>
              void beginEveLogin({ groups: permissionsForEndpoints(['getCharacterOrders']) })
            }
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
                        // A zero-count problem still renders, still a real
                        // focusable button, so the player can see it's clean
                        // rather than wonder where it went — the `0` itself
                        // is the cue; no `opacity-50` fade below AA on top of
                        // it (issue #1491).
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
                  {/*
                    On a phone the character strip below (outside the funnel)
                    is hidden, so its picker lives here instead — the active
                    selection still surfaces as chips in the row below this
                    sheet, same as every other filter field (decision
                    20260924-020211 "Open Orders gets a compact phone list").
                  */}
                  {isPhone && showCharacterStrip && (
                    <div className="w-full border-t border-line pt-2">
                      <CharacterFilterControl
                        characters={entriesWithOrders}
                        activeCharacterId={activeCharacterId}
                        value={characterFilterValueOf(draft.characterIds)}
                        onChange={characterFilterOnChange((characterIds) =>
                          setDraft({ ...draft, characterIds })
                        )}
                      />
                    </div>
                  )}
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
                className="flex min-h-11 items-center rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0"
                onClick={() => setFilter(DEFAULT_FILTER)}
              >
                {t('market.orders.filter.clearAll')}
              </button>
            </div>
          )}

          {showCharacterStrip && !isPhone && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <CharacterFilterControl
                characters={entriesWithOrders}
                activeCharacterId={activeCharacterId}
                value={characterFilterValueOf(filter.characterIds)}
                onChange={characterFilterOnChange((characterIds) =>
                  setFilter({ ...filter, characterIds })
                )}
              />
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
              // Healthy folds through `hideHealthy` rather than
              // `collapsedGroups`: that flag is also what the "N of M orders
              // match" count reads, so two mechanisms would let the caret and
              // the count disagree about whether healthy orders are showing.
              // `isGroupFolded` reads `highlightedRow` live rather than a
              // `setFilter`/`setCollapsedGroups` write, so it never races
              // `useHighlightParam`'s own URL write on first render.
              const folded = isGroupFolded(group.problem, highlightedRow, filter, collapsedGroups);
              const toggle = () => {
                if (group.problem === 'healthy') {
                  setFilter({ ...filter, hideHealthy: !filter.hideHealthy });
                  return;
                }
                setCollapsedGroups((was) => {
                  const next = new Set(was);
                  if (next.has(group.problem)) next.delete(group.problem);
                  else next.add(group.problem);
                  return next;
                });
              };
              const groupTitle = t(`market.orders.group.${group.problem}`);
              return (
                <div key={group.problem} data-testid={`order-group-${group.problem}`}>
                  <div
                    className={cx(
                      'flex flex-col border-l-2 bg-panel-2',
                      GROUP_ACCENT[group.problem]
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 pr-3">
                      {/*
                        Only the caret and the title are inside the button, so
                        its accessible name stays the group's name. The
                        summary line below carries character names, which
                        would otherwise land in the button's name and collide
                        with the character strip's own chips.
                      */}
                      <button
                        type="button"
                        aria-expanded={!folded}
                        onClick={toggle}
                        className="flex min-h-11 flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold tracking-widest text-text-dim uppercase hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-0"
                      >
                        <Caret expanded={!folded} />
                        {groupTitle} · {group.rows.length}
                      </button>
                      <span className="flex items-center gap-3">
                        {group.problem === 'healthy' && (
                          <button
                            type="button"
                            className="flex min-h-11 items-center rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0"
                            onClick={toggle}
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
                            icon={<Icon.Refresh />}
                            label={t('market.orders.checkDeeper')}
                            onClick={() => checkGroupDeeper(group.rows)}
                          />
                        )}
                      </span>
                    </div>
                    {/*
                      What the group holds, said in the header rather than
                      inside a "?" tooltip, so a folded or long group can be
                      judged without opening it: what the group means, then
                      the ISK at stake, the worst gap in it, and whose orders
                      they are.
                    */}
                    <p className="px-3 pb-2 pl-8 text-[0.6875rem] text-text-dim">
                      {groupHeaderLine(group.problem, groupSummaries.get(group.problem), {
                        showCharacters: showCharacterStrip,
                        t,
                      })}
                    </p>
                  </div>
                  {folded ? (
                    group.problem === 'healthy' && (
                      <p className="px-3 py-2 text-xs text-text-dim">
                        {t('market.orders.group.healthyHint')}
                      </p>
                    )
                  ) : isPhone ? (
                    <OpenOrdersList
                      rows={group.rows}
                      label={`${groupTitle} · ${group.rows.length}`}
                      showCharacter={showCharacterStrip}
                      showFloor={hasFloorData}
                      highlightId={highlightId}
                      onOpen={openDetails}
                      rowContextMenu={rowContextMenu}
                    />
                  ) : (
                    <DataTable
                      columns={visibleColumns}
                      rows={group.rows}
                      rowKey={(row) => row.orderId}
                      rowContextMenu={rowContextMenu}
                      rowMoreActions
                      label={`${groupTitle} · ${group.rows.length}`}
                      highlightRowKey={highlightId}
                    />
                  )}
                </div>
              );
            })
          )}

          <div className="flex flex-wrap items-center gap-3 px-3 py-2">
            <button
              type="button"
              className="flex min-h-11 items-center rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0"
              onClick={() => setLegendOpen(true)}
            >
              {t('market.orders.legendOpen')}
            </button>
          </div>
        </>
      )}

      {detailRow && (
        <OrderDetailModal
          // Keyed by orderId so the modal remounts (and its folded-section
          // state resets) between orders, rather than reusing one instance
          // across every row (issue #1428).
          key={detailRow.orderId}
          open={detailOrderId !== null}
          row={detailRow}
          skills={snapshot.skillsByCharacter.get(detailRow.characterId)}
          deep={deepCache.byKey.get(itemKey(detailRow.regionId, detailRow.typeId)) ?? null}
          loadingDeep={deepCache.loadingKeys.has(itemKey(detailRow.regionId, detailRow.typeId))}
          history={historyCache.byKey.get(itemKey(detailRow.regionId, detailRow.typeId)) ?? null}
          stationChecked={snapshot.stationPrices.has(
            stationPriceKey(detailRow.locationId, detailRow.typeId)
          )}
          stationsLoaded={snapshot.stationsLoaded}
          regionJumps={(() => {
            const rival = detailRow.deepUndercut?.byScope.region;
            const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
            if (!rival || mySystemId === undefined) return undefined;
            return jumpsCache.byKey.get(`${mySystemId}:${rival.systemId}`);
          })()}
          stationNameFor={(locationId) => snapshot.npcStations.get(locationId)?.name ?? null}
          structureMarket={structureCache.byKey.get(detailRow.locationId) ?? null}
          reprocessing={((): ReprocessingInput | undefined => {
            const loaded = reprocessingCache.byKey.get(
              stationPriceKey(detailRow.locationId, detailRow.typeId)
            );
            const skills = snapshot.skillsByCharacter.get(detailRow.characterId);
            if (!loaded || !skills) return undefined;
            return {
              entry: loaded.entry,
              materialPrices: loaded.materialPrices,
              modifiers: skills.modifiers,
            };
          })()}
          hubs={((): readonly HubBuyPrice[] | undefined => {
            const byHub = hubPricesCache.byKey.get(detailRow.typeId);
            if (!byHub) return undefined;
            const mySystemId = snapshot.npcStations.get(detailRow.locationId)?.systemId;
            return TRADE_HUBS.map((hub) => ({
              hubId: hub.id,
              systemName: hub.systemName,
              stationId: hub.stationId,
              buyMax: byHub[hub.id] ?? null,
              jumps:
                mySystemId === undefined
                  ? undefined
                  : jumpsCache.byKey.get(`${mySystemId}:${hub.systemId}`),
            }));
          })()}
          hubsFailed={hubPricesCache.failedKeys.has(detailRow.typeId)}
          onCheckDeeper={() => {
            ensureDeepChecked(detailRow.regionId, detailRow.typeId);
            if (detailRow.stationName === null && snapshot.stationsLoaded) {
              // Manual retry forces a new attempt past the sticky gate,
              // unlike the automatic effect above.
              structureCache.reset(detailRow.locationId);
              ensureStructureChecked(detailRow.characterId, detailRow.locationId);
            }
          }}
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
