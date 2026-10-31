import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  CachedNotice,
  EmptyState,
  FilterBar,
  IconButton,
  MenuItem,
  LiveStatus,
  SearchInput,
  SegmentedControl,
  Spinner,
  type DataTableSort,
  sortRows,
} from '@/components/ui';
import { useColumnVisibility } from '@/lib/columnVisibility';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useCharacterCount } from '@/features/character/useCharacters';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import {
  CharacterFilterControl,
  type CharacterScopeChoice,
} from '@/features/character/CharacterFilterControl';
import {
  resolveCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useOpenParam } from '@/lib/useOpenParam';
import { useIsPhone } from '@/lib/useIsPhone';
import {} from '@/lib/useUrlState';
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
import { invalidateStationBestPrices } from './orderCompetition';
import { loadCorpOpenOrdersSnapshot, loadCorpOrdersGrantSnapshot } from './corpOpenOrders';
import { recordOrderProblemSamples, sampleableCharacterIds } from './orderProblemSamples';
import { sampledProblem } from '@/engine/market/orderProblemHistory';
import { buildOpenOrderRows, openOrderProblemCounts, type OpenOrderRow } from './openOrdersModel';
import {
  locationFilterOptions,
  activeFilterCount,
  type OpenOrdersFilter,
} from './openOrdersFilter';
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
import { WorkThroughListSlot } from './WorkThroughControls';
import { WorkThroughContext } from './workThroughContext';
import {
  OPEN_ORDER_COLUMN_IDS,
  OPEN_ORDER_DEFAULT_COLUMNS,
  useVisibleOpenOrderColumns,
} from './openOrdersColumns';
import { useOpenOrderTableColumns } from './openOrdersTableColumns';
import { OpenOrdersFilterFields } from './OpenOrdersFilterFields';
import { useOpenOrdersFilterState } from './useOpenOrdersFilterState';
import { useOpenOrdersWorkThrough } from './useOpenOrdersWorkThrough';
import { FixListSummary, HealthyFold, ListNotes } from './OpenOrdersFixListParts';

const TABLE_LABEL_KEY: Record<OpenOrdersView, string> = {
  act: 'market.orders.fixList.tableAct',
  watch: 'market.orders.fixList.tableWatch',
  all: 'market.orders.fixList.tableAll',
};

interface OpenOrdersPanelProps {
  headerSlots: PageHeaderSlots;
  /** Corporation is the data source: the corp's orders in the same page, the same look. */
  corporation?: boolean;
  /** Corporation source only: the role reads corp orders but the grant lacks the scope, so ask for it. */
  corporationNeedsGrant?: boolean;
  /** Set when the Character can read corp orders: adds "Corporation" to the Character picker. */
  onChooseCorporation?: () => void;
  /** Corporation source only: the picker went straight to This character or All characters. */
  onLeaveCorporation?: () => void;
}

/**
 * Market's Open Orders tab: every selling character's open market orders as a
 * fix list — the orders that need the pilot, worst first, in one flat table
 * that says what is wrong and what to do, with Watch and All one segment away.
 */
export function OpenOrdersPanel({
  headerSlots,
  corporation = false,
  corporationNeedsGrant = false,
  onChooseCorporation,
  onLeaveCorporation,
}: OpenOrdersPanelProps) {
  const { t } = useTranslation();
  const viewedFromUrl = useViewedCharacterId();
  // The URL's Character narrows Character rows; the corporation's are not any Character's.
  const viewedCharacterId = corporation ? undefined : viewedFromUrl;
  // The source is fixed for a mount (the caller keys the panel by it).
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    corporation
      ? corporationNeedsGrant
        ? loadCorpOrdersGrantSnapshot
        : loadCorpOpenOrdersSnapshot
      : loadOpenOrdersSnapshot,
    undefined,
    { cacheKey: corporation ? 'market:corp-orders' : 'market:open-orders' }
  );
  const deviceCharacterCount = useCharacterCount();
  // A manual refresh re-prices too: station prices otherwise answer from the
  // 15-minute price cache.
  const refreshOrders = useCallback(() => {
    if (data) invalidateStationBestPrices(data.stationPrices);
    refresh();
  }, [data, refresh]);

  const {
    filter: urlFilter,
    rowsFilter: urlRowsFilter,
    setFilter: setUrlFilter,
  } = useOpenOrdersFilterState(activeCharacterId);
  // Issuers are not Characters: a remembered Character pick filters nothing here,
  // and is left in the URL for the way back.
  const filter = useMemo(
    () => (corporation ? { ...urlFilter, characterIds: [] } : urlFilter),
    [corporation, urlFilter]
  );
  const rowsFilter = useMemo(
    () => (corporation ? { ...urlRowsFilter, characterIds: [] } : urlRowsFilter),
    [corporation, urlRowsFilter]
  );
  const setFilter = (next: OpenOrdersFilter) =>
    setUrlFilter(corporation ? { ...next, characterIds: urlFilter.characterIds } : next);
  /**
   * The order a Notification Event (an undercut, or a fill) sent the reader
   * to, spent once on arrival (`useHighlightParam`'s own doc). Landing on the
   * row that prompted the click, decision `20260908-123516`.
   */
  const highlightParamId = useHighlightParam();
  /** `?open=` opens the order's modal as a row click would, and flashes the row too. */
  const openParamId = useOpenParam();
  const highlightId = highlightParamId ?? openParamId;
  /** A segment click ends the highlighted row's hold on the segment shown. */
  const [viewPicked, setViewPicked] = useState(false);
  const isPhone = useIsPhone();
  const [detailOrderId, setDetailOrderId] = useState<number | null>(openParamId);
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
  useHydratedStore(useStructureFees);

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
    // Order history is the Character's own: a corporation order's issuer may be an alt.
    if (!snapshot || corporation) return;
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
  }, [snapshot, allRows, corporation]);

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

  const onSeeExits = useCallback((row: OpenOrderRow) => {
    setDetailAtExits(true);
    setDetailOrderId(row.orderId);
  }, []);
  const { workCurrentId, workCurrent, workThroughContext } = useOpenOrdersWorkThrough({
    sortedRows,
    data,
    snapshot,
    ordersByOrderId,
    isPhone,
    rowCount: allRows.length,
    onSeeExits,
  });

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
      scope={
        (showCharacterStrip || onChooseCorporation) && (
          <CharacterFilterControl<CharacterScopeChoice>
            activeCharacterId={activeCharacterId}
            value={corporation ? 'corporation' : characterFilterValue}
            // Under Corporation the entries are issuers, so All counts the device's Characters.
            characterCount={corporation ? deviceCharacterCount : entriesWithOrders.length}
            // The faces are the same Characters the count is: those with orders.
            allCharacterIds={
              corporation ? undefined : entriesWithOrders.map((entry) => entry.characterId)
            }
            corporation={onChooseCorporation !== undefined}
            // The body shows its spinner for the same first load (a switch to or from Corporation remounts).
            loading={loading && !data}
            // Who "All" leaves out (never granted orders): the trigger's dot and menu note.
            missingNames={snapshot?.openOrders.skipped.map((c) => c.name)}
            onChange={(next) => {
              if (next === 'corporation') {
                if (!corporation) onChooseCorporation?.();
                return;
              }
              const resolved = resolveCharacterFilter(next, activeCharacterId);
              setUrlFilter({
                ...urlFilter,
                characterIds: resolved === 'all' ? [] : [...resolved],
              });
              if (corporation) onLeaveCorporation?.();
            }}
          />
        )
      }
      actions={
        <>
          {/* Export before Refresh, as on every header (DESIGN.md §6c Header controls). */}
          {snapshot && (
            <TableActionsMenu
              name={t('market.orders.tableName')}
              tableExport={ordersExport}
              size="md"
            />
          )}
          <IconButton
            icon={<Icon.Refresh />}
            label={t('market.orders.refreshOrders')}
            onClick={refreshOrders}
          />
        </>
      }
    />
  );

  if (!hydrated) {
    return (
      <>
        {headerChrome}
        <Spinner block="page" label={t('common.loading')} />
      </>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (loading && !data) {
    return (
      <>
        {headerChrome}
        <Spinner block="page" label={t('common.loading')} />
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

  const activeCount = activeFilterCount(filter);

  const notShared = snapshot.openOrders.skipped;
  const pickerNamesMissing = showCharacterStrip && !corporation && characterFilterValue === 'all';
  const corpReauth = corporation && snapshot.corporation?.needsReauth === true;

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
  const noOrders = reauthEntries.length === 0 && !corpReauth && allRows.length === 0;
  // The grant banner alone says why the corporation's list is empty; no list chrome under it.
  const corpGrantOnly = corpReauth && allRows.length === 0;

  return (
    <>
      {headerChrome}
      <WorkThroughContext.Provider value={workThroughContext}>
        <div className="min-w-0 space-y-3">
          {viewedCharacterId !== undefined && (
            <div className="flex items-center gap-3">
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

          {corpReauth && (
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCorporationOrders']}
              title={t('market.orders.corp.reauthTitle')}
              hint={t('market.orders.corp.reauthHint')}
              actionLabel={t('market.orders.corp.reauthAction')}
            />
          )}

          {fromCacheAny && <CachedNotice fetchedAt={oldestFetchedAt} />}

          {corpGrantOnly ? null : noOrders ? (
            // Every Character skipped: the "hasn't shared" note below already says why.
            notShared.length > 0 && snapshot.openOrders.entries.length === 0 ? null : (
              <CachedEmptyState
                result={{ fromCache: fromCacheAny }}
                title={t(corporation ? 'market.orders.corp.emptyTitle' : 'orders.emptyTitle')}
                hint={t(corporation ? 'market.orders.corp.emptyHint' : 'orders.emptyHint')}
                fetchedTitle={t(
                  corporation ? 'market.orders.corp.emptyFetchedTitle' : 'orders.emptyFetchedTitle'
                )}
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
                  activeCount={activeCount}
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
                    <OpenOrdersFilterFields
                      draft={draft}
                      setDraft={setDraft}
                      problemCounts={problemCounts}
                      locationOptions={locationOptions}
                      showLocationFilter={showLocationFilter}
                    />
                  )}
                </FilterBar>
              </div>

              {/*
                Only a funnel filter narrows: a segment hiding the rest is not
                a failed match (issue #2032), and its count is on its button.
              */}
              <LiveStatus>
                {fixList.matching.length === 0
                  ? t('orders.noResults')
                  : activeCount > 0 &&
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

          {/* With the picker on All, it names who is left out itself (`missingNames`);
              otherwise (no picker, or one Character's view) the foot still says so. */}
          <ListNotes
            floorCharacters={floorCharacters}
            notShared={pickerNamesMissing ? [] : notShared}
          />

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
