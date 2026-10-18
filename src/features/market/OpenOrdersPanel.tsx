import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  CachedNotice,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  MenuItem,
  MultiSelect,
  LiveStatus,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  textActionClassName,
  type DataTableSort,
  sortRows,
} from '@/components/ui';
import { useColumnVisibility } from '@/lib/columnVisibility';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { WalletOriginCrumb } from '@/features/character/WalletOriginCrumb';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  resolveCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  filterFromParamValues,
  paramsPatchFromFilter,
  useRememberedUrlParams,
  type UrlParamValues,
} from '@/lib/useUrlState';
import { formatIskCompact } from '@/lib/isk';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { PageHeaderPortals } from './PageHeaderPortals';
import type { PageHeaderSlots } from './pageHeaderSlots';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CsvColumn } from '@/lib/csv';
import { ordersCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrder } from '@/esi/endpoints';
import type { CompetingOrder } from '@/engine/market/undercut';
import { ItemContextMenu } from './ItemContextMenu';
import { OpenOrdersList } from './OpenOrdersList';
import { loadOpenOrdersSnapshot } from './openOrdersPageSnapshot';
import { recordOrderProblemSamples, sampleableCharacterIds } from './orderProblemSamples';
import { sampledProblem } from '@/engine/market/orderProblemHistory';
import {
  buildOpenOrderRows,
  openOrderProblemCounts,
  ownOrderIdSet,
  type OpenOrderRow,
} from './openOrdersModel';
import {
  EMPTY_OPEN_ORDERS_FILTER,
  FILTERABLE_PROBLEMS,
  locationFilterOptions,
  OPEN_ORDERS_FIELD_TO_PARAM,
  OPEN_ORDERS_FILTER_PARAMS,
  OPEN_ORDERS_SORTS,
  activeFilterChips,
  type OpenOrdersFilter,
  type OpenOrdersSort,
} from './openOrdersFilter';
import { useCharacterFilterPick } from '@/features/character/characterFilterPicks';
import { useOpenOrdersLocationFilterPref } from './openOrdersLocationFilterPref';
import { buildOpenOrdersView, shownView } from './openOrdersView';
import { rowInView, type OpenOrdersView } from './orderUrgency';
import { doThisPrice, rowFixCall } from './orderDoThis';
import { OrderBadgeLegend } from './OrderBadgeLegend';
import { priceClipboardText } from './priceClipboardText';
import { writeToClipboard } from '@/lib/clipboard';
import { OrderDetailModal } from './OrderDetailModal';
import { useOrderDetail } from './useOrderDetail';
import { useStructureFees } from './structureFees';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import { itemKey } from './orderDetailView';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { OPEN_IN_EVE_ENDPOINTS } from '@/features/openInEve/sendOpenInEve';
import { workThroughQueue } from './workThrough';
import { useWorkThrough, useWorkThroughStartParam } from './useWorkThrough';
import { WorkThroughListSlot } from './WorkThroughControls';
import { WorkThroughContext, type WorkThroughContextValue } from './workThroughContext';
import {
  OPEN_ORDER_COLUMN_IDS,
  OPEN_ORDER_DEFAULT_COLUMNS,
  useVisibleOpenOrderColumns,
} from './openOrdersColumns';
import { useOpenOrderTableColumns } from './openOrdersTableColumns';
import { FixListSummary, HealthyFold, ListNotes } from './OpenOrdersFixListParts';

/** A bare visit opens on Needs you, every funnel field clear. */
const DEFAULT_FILTER: OpenOrdersFilter = EMPTY_OPEN_ORDERS_FILTER;

const SORTS: readonly OpenOrdersSort[] = OPEN_ORDERS_SORTS;

/**
 * Every problem worth a funnel chip. The same set a deep link may name, and
 * deliberately the same constant: the funnel and the URL are two ways to reach
 * one filter, and `healthy` is excluded from both for the reason
 * `FILTERABLE_PROBLEMS` gives.
 */
const PROBLEM_FILTER_OPTIONS = FILTERABLE_PROBLEMS;

const EXPIRING_WITHIN_DAY_OPTIONS = [3, 7, 14, 30] as const;
const MIN_ISK_TIED_UP_OPTIONS = [10_000_000, 100_000_000, 1_000_000_000] as const;

const TABLE_LABEL_KEY: Record<OpenOrdersView, string> = {
  act: 'market.orders.fixList.tableAct',
  watch: 'market.orders.fixList.tableWatch',
  all: 'market.orders.fixList.tableAll',
};

interface ActiveChipDisplay {
  id: string;
  label: string;
  clear: () => void;
}

interface OpenOrdersPanelProps {
  headerSlots: PageHeaderSlots;
}

/**
 * Market's Open Orders tab: every selling character's open market orders as a
 * fix list — the orders that need the pilot, worst first, in one flat table
 * that says what is wrong and what to do, with Watch and All one segment away.
 */
export function OpenOrdersPanel({ headerSlots }: OpenOrdersPanelProps) {
  const { t } = useTranslation();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadOpenOrdersSnapshot,
    undefined,
    { cacheKey: 'market:open-orders' }
  );

  /*
   * The whole filter lives in the URL (ADR 0015), one `orders.*` key per
   * field — a deep link (an Overview Orders widget's row, `openOrdersHref`)
   * narrows it on arrival, and every chip, select, segment and search
   * keystroke from here on writes straight back to it, so a reload or a
   * shared link always reopens exactly what was on screen.
   *
   * `orders.locations` is the one exception: a bare `/market/orders` visit
   * (no query string at all — every app relaunch) falls back to the
   * device-local pick remembered in `openOrdersLocationFilterPref.ts`
   * (decision `20260922-221531` / ADR 0015), via `useRememberedUrlParams`
   * rather than the plain `useUrlFilter` every other field still reads
   * through. The URL always wins when it states the field; the stored value
   * is never mirrored back into it.
   */
  const rememberedLocationIds = useOpenOrdersLocationFilterPref((state) => state.value);
  const hydrateRememberedLocationIds = useOpenOrdersLocationFilterPref((state) => state.hydrate);
  useEffect(() => {
    void hydrateRememberedLocationIds();
  }, [hydrateRememberedLocationIds]);
  // `orders.characters` remembers the This character / All characters pick the
  // same way the other pages do, then the synced Settings default. `'current'`
  // is `[activeCharacterId]` here, so it keeps following the active Character.
  const { pick: rememberedCharacterPick, remember: rememberCharacterPick } =
    useCharacterFilterPick('orders');
  const rememberedCharacterIds = useMemo<readonly number[]>(
    () =>
      rememberedCharacterPick === 'current' && activeCharacterId !== null
        ? [activeCharacterId]
        : [],
    [rememberedCharacterPick, activeCharacterId]
  );
  const remembered = useMemo(
    () => ({
      values: {
        'orders.locations': rememberedLocationIds,
        'orders.characters': rememberedCharacterIds,
      },
      remember: (patch: Partial<UrlParamValues<typeof OPEN_ORDERS_FILTER_PARAMS>>) => {
        if ('orders.locations' in patch) {
          void useOpenOrdersLocationFilterPref
            .getState()
            .setValue(patch['orders.locations'] as readonly number[]);
        }
        const characterIds = patch['orders.characters'] as readonly number[] | undefined;
        if (characterIds) {
          void rememberCharacterPick(
            characterIds.length === 1 && characterIds[0] === activeCharacterId ? 'current' : 'all'
          );
        }
      },
    }),
    [rememberedLocationIds, rememberedCharacterIds, rememberCharacterPick, activeCharacterId]
  );
  const [params, setParams] = useRememberedUrlParams(OPEN_ORDERS_FILTER_PARAMS, remembered);
  const filter = useMemo(
    () => filterFromParamValues<OpenOrdersFilter>(params, OPEN_ORDERS_FIELD_TO_PARAM),
    [params]
  );
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar, chips and setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  function setFilter(next: OpenOrdersFilter) {
    setParams(paramsPatchFromFilter(next, OPEN_ORDERS_FIELD_TO_PARAM));
  }
  /**
   * The order a Notification Event (an undercut, or a fill) sent the reader
   * to, spent once on arrival (`useHighlightParam`'s own doc). Landing on the
   * row that prompted the click, decision `20260908-123516`.
   */
  const highlightId = useHighlightParam();
  /** A segment click ends the highlighted row's hold on the segment shown. */
  const [viewPicked, setViewPicked] = useState(false);
  const isPhone = useIsPhone();
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  /** Set only by a work-through row's "See exits": the detail opens at its exits. */
  const [detailAtExits, setDetailAtExits] = useState(false);
  /** The table's header-click sort, held here so the work-through walks rows in the order they show. */
  const [tableSort, setTableSort] = useState<DataTableSort | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  /**
   * The Order Detail modal's loading, page-level: its caches outlive any one
   * modal, and its region and structure books also reclassify the rows below
   * (`useOrderDetail`'s own doc).
   */
  const orderDetail = useOrderDetail();
  const structureFees = useStructureFees((state) => state.value);
  useEffect(() => {
    void useStructureFees.getState().hydrate();
  }, []);

  const {
    visible: visibleColumnIds,
    toggle: toggleColumn,
    reset: resetColumns,
  } = useColumnVisibility(useVisibleOpenOrderColumns, OPEN_ORDER_DEFAULT_COLUMNS);

  // A Character named in the URL narrows the whole page to that Character —
  // its rows, grant notes and skipped note — and is stated by the readout.
  const viewedCharacter = useLiveQuery(
    async () =>
      viewedCharacterId === undefined ? undefined : db.characters.get(viewedCharacterId),
    [viewedCharacterId]
  );
  const viewedLacksOrdersScope = useCharacterLacksEndpoints(viewedCharacterId ?? null, [
    'getCharacterOrders',
  ]);
  const snapshot = useMemo(
    () =>
      data && viewedCharacterId !== undefined
        ? {
            ...data,
            openOrders: {
              ...data.openOrders,
              entries: data.openOrders.entries.filter((e) => e.characterId === viewedCharacterId),
              skipped: data.openOrders.skipped.filter((s) => s.characterId === viewedCharacterId),
            },
          }
        : data,
    [data, viewedCharacterId]
  );

  const deepCompetitionByOrderId = useMemo(() => {
    const m = new Map<number, { competitors: readonly CompetingOrder[]; truncated: boolean }>();
    if (!snapshot) return m;
    for (const entry of snapshot.openOrders.entries) {
      for (const order of entry.orders) {
        const rc = orderDetail.caches.regionBooks.get(itemKey(order.region_id, order.type_id));
        if (rc) m.set(order.order_id, { competitors: rc.competitors, truncated: rc.truncated });
      }
    }
    return m;
  }, [snapshot, orderDetail.caches.regionBooks]);

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
      structureCompetition: orderDetail.caches.structureBooks,
      stationNames,
      problemSamples: snapshot.problemSamples,
      skillsByCharacter: snapshot.skillsByCharacter,
      standingsByOrder: snapshot.standingsByOrder,
      structureFees,
      now: snapshot.now,
    });
  }, [
    snapshot,
    deepCompetitionByOrderId,
    orderDetail.caches.structureBooks,
    stationNames,
    structureFees,
  ]);

  /**
   * The highlighted row, found before any segment or filter narrows the
   * screen — null when nothing matches is harmless (decision
   * `20260908-123516`). It only widens the segment shown (`shownView`), never
   * an active content filter (search/problem/character).
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
        unchecked: row.competitionUnchecked === true,
      })),
      characterIds,
      snapshot.now
    ).catch(() => {});
  }, [snapshot, allRows]);

  const problemCounts = useMemo(() => openOrderProblemCounts(allRows), [allRows]);

  const fixList = useMemo(() => buildOpenOrdersView(allRows, rowsFilter), [allRows, rowsFilter]);

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

  /**
   * Every location currently holding an open order — the location filter's
   * option catalog, so a saved pick from a station that has since sold out
   * can still be seen and untoggled rather than just quietly narrowing to
   * nothing (see `filter.locationIds` below).
   */
  const locationOptions = useMemo(
    () =>
      locationFilterOptions(allRows, (locationId) =>
        t('market.orders.filter.unknownLocation', { id: locationId })
      ),
    [allRows, t]
  );
  const locationNamesById = useMemo(
    () => new Map(locationOptions.map((option) => [option.locationId, option.label])),
    [locationOptions]
  );
  const showLocationFilter = locationOptions.length > 1;

  const ordersByOrderId = useMemo(() => {
    const m = new Map<number, MarketOrder>();
    if (!snapshot) return m;
    for (const entry of snapshot.openOrders.entries) {
      for (const order of entry.orders) m.set(order.order_id, order);
    }
    return m;
  }, [snapshot]);

  const { columns, optional: optionalColumns } = useOpenOrderTableColumns({
    showCharacter: showCharacterStrip,
    visible: visibleColumnIds,
  });

  /** The header sort, dropped once the Columns menu hides its column. */
  const sortColumn = tableSort && columns.find((c) => c.id === tableSort.columnId);
  const activeSort = sortColumn ? tableSort : null;
  /** Every row the funnel matched, in the table's order. */
  const sortedRows = useMemo(
    () =>
      sortColumn && tableSort
        ? sortRows(fixList.matching, sortColumn, tableSort.direction)
        : fixList.matching,
    [fixList.matching, sortColumn, tableSort]
  );

  // Every row the funnel matched, whichever segment shows, exported as the ESI
  // orders behind them — hence `source: 'rows'`.
  const csvRows = useMemo(
    () => sortedRows.filter((row) => ordersByOrderId.has(row.orderId)),
    [sortedRows, ordersByOrderId]
  );
  const csvColumns = useMemo<CsvColumn<OpenOrderRow>[]>(
    () =>
      ordersCsvColumns(t, (typeId) => snapshot?.typeNames.get(typeId) ?? `Type #${typeId}`).map(
        (column) => ({
          header: column.header,
          value: (row) => column.value(ordersByOrderId.get(row.orderId)!),
        })
      ),
    [t, snapshot, ordersByOrderId]
  );
  const ordersExport = useTableExport({
    surface: 'orders-open',
    rows: csvRows,
    columns: csvColumns,
    source: 'rows',
  });

  // Whoever has a floor on any matched order: each note checks that
  // character's own grant, since each floor prices with its standings.
  const floorCharacters = useMemo(
    () =>
      [...new Set(fixList.matching.filter((row) => row.floor).map((row) => row.characterId))].map(
        (characterId) => ({
          characterId,
          name: characterNamesById.get(characterId) ?? '',
        })
      ),
    [fixList.matching, characterNamesById]
  );

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

  const workQueue = useMemo(() => workThroughQueue(sortedRows), [sortedRows]);
  // Only the answer leaves the query, never a `TokenRecord` (ADR 0001).
  const openInEveCharacterIds = useLiveQuery(async () => {
    const required = requiredScopesForEndpoints(OPEN_IN_EVE_ENDPOINTS);
    const tokens = await db.tokens.toArray();
    return new Set(
      tokens
        .filter((token) => required.every((scope) => token.scopes.includes(scope)))
        .map((token) => token.characterId)
    );
  }, []);
  const canOpenInEve = useCallback(
    (characterId: number) => openInEveCharacterIds?.has(characterId) ?? false,
    [openInEveCharacterIds]
  );
  // Every Character's orders, before any narrowing: never undercut an alt.
  const ownOrderIds = useMemo(
    () => (data ? ownOrderIdSet(data.openOrders) : new Set<number>()),
    [data]
  );
  const fetchedAtByCharacter = useMemo(
    () => new Map((snapshot?.openOrders.entries ?? []).map((e) => [e.characterId, e.fetchedAt])),
    [snapshot]
  );
  const workThrough = useWorkThrough({
    queue: workQueue,
    isPhone,
    ownOrderIds,
    canOpenInEve,
    ordersById: ordersByOrderId,
    fetchedAtByCharacter,
  });
  const workCurrentId = workThrough.currentId;
  const workCurrent = workCurrentId === null ? null : workThrough.progress.current;
  const startRequested = useWorkThroughStartParam();
  const startedFromLink = useRef(false);
  const { start: startWorkThrough } = workThrough;
  useEffect(() => {
    if (!startRequested || startedFromLink.current || allRows.length === 0) return;
    startedFromLink.current = true;
    startWorkThrough();
  }, [startRequested, allRows.length, startWorkThrough]);
  useEffect(() => {
    if (workCurrentId === null) return;
    document
      .querySelector(`[data-row-key="${workCurrentId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [workCurrentId]);
  const manyOwners = useMemo(
    () => new Set(workQueue.map((row) => row.characterId)).size > 1,
    [workQueue]
  );
  const workThroughContext = useMemo<WorkThroughContextValue>(
    () => ({
      workThrough,
      canOpenInEve,
      manyOwners,
      onSeeExits: (row) => {
        setDetailAtExits(true);
        setDetailOrderId(row.orderId);
      },
    }),
    [workThrough, canOpenInEve, manyOwners]
  );

  /**
   * The segment on screen: the picked one, widened to All while the
   * work-through's current order, or (until the pilot picks a segment) the
   * highlighted one, sits outside it — the walk takes in Watch's system and
   * region undercuts too.
   */
  const view = shownView(filter.view, workCurrent ?? (viewPicked ? null : highlightedRow));
  const viewRows = useMemo(
    () => (view === 'all' ? sortedRows : sortedRows.filter((row) => rowInView(row, view))),
    [sortedRows, view]
  );

  /**
   * `CharacterFilterControl`'s `value`: `'current'` only for the exact
   * single-id array `characterFilterOnChange` itself writes for that literal
   * value (`[activeCharacterId]`), everything else `'all'` — the closest this
   * narrowed picker can still say honestly. That covers a legacy hand-picked
   * subset link and the Overview Orders widget's deep link naming one *other*
   * alt the same way: the label reads "All characters" rather than lying that
   * it is "This character", while the table itself keeps filtering to
   * whatever `characterIds` holds (`matchesCharacterIds` reads it directly).
   */
  const characterFilterValue: CharacterFilterValue =
    filter.characterIds.length === 1 && filter.characterIds[0] === activeCharacterId
      ? 'current'
      : 'all';

  const headerChrome = (
    <PageHeaderPortals
      slots={headerSlots}
      meta={oldestFetchedAt !== null && <DataAgeBadge date={new Date(oldestFetchedAt)} />}
      actions={
        <>
          {showCharacterStrip && (
            <CharacterFilterControl
              size="md"
              activeCharacterId={activeCharacterId}
              value={characterFilterValue}
              characterCount={entriesWithOrders.length}
              onChange={(next) => {
                const resolved = resolveCharacterFilter(next, activeCharacterId);
                setFilter({ ...filter, characterIds: resolved === 'all' ? [] : [...resolved] });
              }}
            />
          )}
          <IconButton
            icon={<Icon.Refresh />}
            label={t('market.orders.refreshOrders')}
            onClick={refresh}
          />
          {snapshot && (
            <TableActionsMenu
              name={t('market.orders.tableName')}
              tableExport={ordersExport}
              size="md"
            />
          )}
        </>
      }
    />
  );

  if (!hydrated) {
    return (
      <>
        {headerChrome}
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      </>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (loading && !data) {
    return (
      <>
        {headerChrome}
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      </>
    );
  }
  if (error || !snapshot) {
    return (
      <>
        {headerChrome}
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      </>
    );
  }

  const visibleChips: ActiveChipDisplay[] = activeFilterChips(filter).map((chip) => ({
    id: chip.id,
    label: chipLabel(chip, characterNamesById, locationNamesById, t),
    clear: () => setFilter(chip.clear(filter)),
  }));

  const notShared = snapshot.openOrders.skipped;

  // The modal loads what the order needs as it opens (`useOpenOrderDetail`).
  function openDetails(row: OpenOrderRow) {
    setDetailAtExits(false);
    setDetailOrderId(row.orderId);
  }

  function pickView(next: OpenOrdersView) {
    setViewPicked(true);
    setFilter({ ...filter, view: next });
  }

  /** Same menu Transactions carries — an order row names an item like any other. */
  function rowContextMenu(row: OpenOrderRow, tr: ReactElement) {
    // The price "Do this" names, so the menu and the cell never disagree.
    const newPrice = doThisPrice(rowFixCall(row).call);
    return (
      <ItemContextMenu
        typeId={row.typeId}
        extraItems={
          <>
            {newPrice !== null && (
              <MenuItem onSelect={() => void writeToClipboard(priceClipboardText(newPrice))}>
                {t('market.orders.copyNewPrice')}
              </MenuItem>
            )}
            {/* Only where the station is named: an unnamed structure has nothing to show. */}
            {row.stationName !== null && (
              <SetWaypointMenuItem locationId={row.locationId} placeName={row.stationName} />
            )}
          </>
        }
        itemName={row.typeName}
      >
        {tr}
      </ItemContextMenu>
    );
  }

  const tableLabel = t(TABLE_LABEL_KEY[view]);
  const noOrders = reauthEntries.length === 0 && allRows.length === 0;

  return (
    <>
      {headerChrome}
      <WorkThroughContext.Provider value={workThroughContext}>
        <div className="min-w-0 space-y-3">
          {viewedCharacterId !== undefined && (
            <div className="flex items-center gap-3">
              <WalletOriginCrumb />
              {viewedCharacter && (
                <CharacterScopeReadout
                  scope="one"
                  characterId={viewedCharacter.characterId}
                  characterName={viewedCharacter.name}
                />
              )}
            </div>
          )}
          {viewedCharacterId !== undefined &&
            viewedLacksOrdersScope &&
            !reauthEntries.some((e) => e.characterId === viewedCharacterId) && (
              <GrantBanner
                characterId={viewedCharacterId}
                characterName={viewedCharacter?.name}
                endpoints={['getCharacterOrders']}
                variant="ghost"
                title={t('orders.reauthTitle')}
                hint={t('orders.reauthHint')}
                actionLabel={t('orders.reauthAction')}
              />
            )}
          {reauthEntries.map((entry) => (
            <GrantBanner
              key={entry.characterId}
              characterId={entry.characterId}
              characterName={entry.characterName}
              endpoints={['getCharacterOrders']}
              variant="ghost"
              title={t('orders.reauthTitle')}
              hint={t('orders.reauthHint')}
              actionLabel={t('orders.reauthAction')}
            />
          ))}

          {fromCacheAny && <CachedNotice fetchedAt={oldestFetchedAt} />}

          {noOrders ? (
            // Every Character skipped: the "hasn't shared" note below already says why.
            notShared.length > 0 && snapshot.openOrders.entries.length === 0 ? null : (
              <CachedEmptyState
                result={{ fromCache: fromCacheAny }}
                title={t('orders.emptyTitle')}
                hint={t('orders.emptyHint')}
                fetchedTitle={t('orders.emptyFetchedTitle')}
                className="py-8"
              />
            )
          ) : (
            <>
              <FixListSummary
                actCount={fixList.act.length}
                actIskTiedUp={fixList.actIskTiedUp}
                watchCount={fixList.watch.length}
                fineCount={fixList.fine.length}
              />

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SegmentedControl<OpenOrdersView>
                  label={t('market.orders.fixList.views')}
                  uppercase={false}
                  fill
                  value={view}
                  onChange={pickView}
                  options={[
                    {
                      value: 'act',
                      label: t('market.orders.fixList.viewAct', { count: fixList.act.length }),
                    },
                    {
                      value: 'watch',
                      label: t('market.orders.fixList.viewWatch', { count: fixList.watch.length }),
                    },
                    {
                      value: 'all',
                      label: t('market.orders.fixList.viewAll', {
                        count: fixList.matching.length,
                      }),
                    },
                  ]}
                />
                <FilterBar
                  className="min-w-0 flex-1"
                  value={filter}
                  onChange={setFilter}
                  // The active chips stay outside the funnel box, where they can
                  // be seen and dropped.
                  activeCount={visibleChips.length}
                  actions={
                    // The phone cards ignore column choices, so the picker
                    // would have nothing to act on there.
                    !isPhone && (
                      <ColumnPickerMenu
                        available={OPEN_ORDER_COLUMN_IDS}
                        visible={visibleColumnIds}
                        columnsById={optionalColumns}
                        onToggle={toggleColumn}
                        buttonLabel={t('common.columnsButton')}
                        menuTitle={t('market.orders.fixList.columnsMenuTitle')}
                        onReset={resetColumns}
                        resetLabel={t('common.resetColumns')}
                        showLabel
                      />
                    )
                  }
                  search={
                    <SearchInput
                      value={filter.text}
                      onChange={(event) => setFilter({ ...filter, text: event.target.value })}
                      placeholder={t('orders.searchPlaceholder')}
                      className="min-w-40 flex-1"
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
                          draft.expiringWithinDays === null
                            ? 'any'
                            : String(draft.expiringWithinDays)
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
                          <SelectItem value="any">{t('market.orders.filter.anyExpiry')}</SelectItem>
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
                          setDraft({
                            ...draft,
                            minIskTiedUp: value === 'any' ? null : Number(value),
                          })
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
                          <SelectItem value="any">{t('market.orders.filter.anySize')}</SelectItem>
                          {MIN_ISK_TIED_UP_OPTIONS.map((amount) => (
                            <SelectItem key={amount} value={String(amount)}>
                              {t('market.orders.filter.minIskTiedUpOption', {
                                amount: formatIskCompact(amount),
                              })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showLocationFilter && (
                        <MultiSelect
                          label={t('market.orders.filter.location')}
                          trigger={
                            <Button size="sm">
                              {draft.locationIds.length === 0
                                ? t('market.orders.filter.allLocations')
                                : t('market.orders.filter.selectedLocationsCount', {
                                    count: draft.locationIds.length,
                                  })}
                            </Button>
                          }
                          options={locationOptions.map((option) => ({
                            id: option.locationId,
                            label: option.label,
                          }))}
                          selected={new Set(draft.locationIds)}
                          onToggle={(locationId) =>
                            setDraft({
                              ...draft,
                              locationIds: draft.locationIds.includes(locationId)
                                ? draft.locationIds.filter((id) => id !== locationId)
                                : [...draft.locationIds, locationId],
                            })
                          }
                          searchPlaceholder={t('market.orders.filter.locationSearchPlaceholder')}
                          noResultsLabel={t('market.orders.filter.locationNoResults')}
                          extraContent={(close) => (
                            <div className="border-b border-line p-1">
                              <Button
                                variant="ghost"
                                align="start"
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                  setDraft({ ...draft, locationIds: [] });
                                  close();
                                }}
                              >
                                {t('market.orders.filter.allLocations')}
                              </Button>
                            </div>
                          )}
                        />
                      )}
                      <Select
                        value={draft.sort}
                        onValueChange={(value) =>
                          setDraft({ ...draft, sort: value as OpenOrdersSort })
                        }
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
                              {t(
                                `market.orders.filter.sort${sort[0].toUpperCase()}${sort.slice(1)}`
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </FilterBar>
              </div>

              {visibleChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {visibleChips.map((chip) => (
                    <FilterChip key={chip.id} label={chip.label} selected onToggle={chip.clear} />
                  ))}
                  <button
                    type="button"
                    className={textActionClassName()}
                    onClick={() => setFilter({ ...DEFAULT_FILTER, view: filter.view })}
                  >
                    {t('market.orders.filter.clearAll')}
                  </button>
                </div>
              )}

              {/*
                Only a funnel filter narrows: a segment hiding the rest is not
                a failed match (issue #2032), and its count is on its button.
              */}
              <LiveStatus>
                {fixList.matching.length === 0
                  ? t('orders.noResults')
                  : visibleChips.length > 0 &&
                    t('market.orders.filter.matchCount', {
                      count: fixList.matching.length,
                      total: allRows.length,
                    })}
              </LiveStatus>

              {fixList.matching.length === 0 ? (
                <EmptyState title={t('orders.noResults')} className="py-8" />
              ) : viewRows.length === 0 ? (
                <p className="py-4 text-sm text-text-dim">
                  {t(
                    view === 'watch'
                      ? 'market.orders.fixList.emptyWatch'
                      : 'market.orders.fixList.emptyAct'
                  )}
                </p>
              ) : isPhone ? (
                <OpenOrdersList
                  rows={viewRows}
                  label={tableLabel}
                  highlightId={highlightId}
                  selectedId={workCurrentId}
                  rowExtra={(row) => <WorkThroughListSlot row={row} />}
                  onOpen={openDetails}
                  rowContextMenu={rowContextMenu}
                />
              ) : (
                // Many columns on: the table scrolls sideways in its own frame,
                // never the page.
                <div className="min-w-0 overflow-x-auto">
                  <DataTable
                    {...ordersExport.tableProps}
                    // The ⋮ in the text colour, as the order book's.
                    className="dt-actions-pinned-only"
                    density="compact"
                    columns={columns}
                    rows={viewRows}
                    rowKey={(row) => row.orderId}
                    rowContextMenu={rowContextMenu}
                    rowMoreActions
                    onRowClick={openDetails}
                    label={tableLabel}
                    highlightRowKey={highlightId}
                    selectedRowKey={workCurrentId}
                    sort={activeSort}
                    onSortChange={setTableSort}
                  />
                </div>
              )}

              <HealthyFold
                fineCount={fixList.fine.length}
                folded={view !== 'all'}
                onShow={() => pickView('all')}
                onLegend={() => setLegendOpen(true)}
              />
            </>
          )}

          <ListNotes floorCharacters={floorCharacters} notShared={notShared} />

          {detailRow && (
            <OrderDetailModal
              // Keyed by orderId so the modal remounts (and its folded-section
              // state resets) between orders, rather than reusing one instance
              // across every row (issue #1428).
              key={detailRow.orderId}
              row={detailRow}
              snapshot={snapshot}
              detail={orderDetail}
              initialSection={detailAtExits ? 'exits' : undefined}
              onClose={() => setDetailOrderId(null)}
            />
          )}
          <OrderBadgeLegend open={legendOpen} onClose={() => setLegendOpen(false)} />
        </div>
      </WorkThroughContext.Provider>
    </>
  );
}

function chipLabel(
  chip: ReturnType<typeof activeFilterChips>[number],
  characterNamesById: ReadonlyMap<number, string>,
  locationNamesById: ReadonlyMap<number, string>,
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
  if (chip.id.startsWith('location:')) {
    const locationId = Number(chip.value);
    return `${label}: ${locationNamesById.get(locationId) ?? chip.value}`;
  }
  if (chip.id.startsWith('problem:')) return `${label}: ${t(`market.orders.group.${chip.value}`)}`;
  if (chip.id === 'costBasis') {
    return `${label}: ${t(chip.value === 'linked' ? 'market.orders.filter.costBasisLinked' : 'market.orders.filter.costBasisMissing')}`;
  }
  if (chip.value !== undefined) return `${label}: ${chip.value}`;
  return label;
}
