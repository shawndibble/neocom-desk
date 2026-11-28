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
  MenuGroup,
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
import { ordersCsvColumns } from './ordersCsv';
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
  activeOpenOrdersFilters,
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
import { ViewRouteMenuItem } from '@/features/travel/ViewRouteMenuItem';
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
import { useTurnInOffers } from '@/features/campaigns/useTurnIns';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { useHubFor } from './hub';
import { TableScroll } from '@/components/ui/TableScroll';

const TABLE_LABEL_KEY: Record<OpenOrdersView, string> = {
  act: 'market.orders.fixList.tableAct',
  watch: 'market.orders.fixList.tableWatch',
  all: 'market.orders.fixList.tableAll',
};

interface OpenOrdersPanelProps {
  headerSlots: PageHeaderSlots;
  corporation?: boolean;
  corporationNeedsGrant?: boolean;
  onChooseCorporation?: () => void;
  onLeaveCorporation?: () => void;
}

export function OpenOrdersPanel({
  headerSlots,
  corporation = false,
  corporationNeedsGrant = false,
  onChooseCorporation,
  onLeaveCorporation,
}: OpenOrdersPanelProps) {
  const { t } = useTranslation();
  const viewedFromUrl = useViewedCharacterId();
  const viewedCharacterId = corporation ? undefined : viewedFromUrl;
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
  const refreshOrders = useCallback(() => {
    if (data) invalidateStationBestPrices(data.stationPrices);
    refresh();
  }, [data, refresh]);

  const {
    filter: urlFilter,
    rowsFilter: urlRowsFilter,
    setFilter: setUrlFilter,
  } = useOpenOrdersFilterState(activeCharacterId);
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
  const highlightParamId = useHighlightParam();
  const openParamId = useOpenParam();
  const highlightId = highlightParamId ?? openParamId;
  const [viewPicked, setViewPicked] = useState(false);
  const isPhone = useIsPhone();
  const [detailOrderId, setDetailOrderId] = useState<number | null>(openParamId);
  const [tableSort, setTableSort] = useState<DataTableSort | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const orderDetail = useOrderDetail();
  const structureFees = useStructureFees((state) => state.value);
  useHydratedStore(useStructureFees);
  const { hubId, hydrated: hubHydrated } = useHubFor('market');
  const turnInLoad = useTurnInOffers(
    corporation || !hubHydrated ? null : (getTradeHub(hubId) ?? DEFAULT_TRADE_HUB)
  );
  const turnIns = turnInLoad.status === 'ready' ? turnInLoad.data : null;
  const turnInPerItem = useMemo(
    () =>
      turnIns
        ? new Map([...turnIns.byType].map(([typeId, offer]) => [typeId, offer.totalPerItem]))
        : undefined,
    [turnIns]
  );
  const openDetails = useCallback((row: OpenOrderRow) => setDetailOrderId(row.orderId), []);

  const {
    visible: visibleColumnIds,
    toggle: toggleColumn,
    reset: resetColumns,
  } = useColumnVisibility(useVisibleOpenOrderColumns, OPEN_ORDER_DEFAULT_COLUMNS);

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
      turnInPerItem,
      now: snapshot.now,
    });
  }, [
    snapshot,
    deepCompetitionByOrderId,
    orderDetail.caches.structureBooks,
    stationNames,
    structureFees,
    turnInPerItem,
  ]);

  const highlightedRow = useMemo(
    () => (highlightId === null ? null : (allRows.find((r) => r.orderId === highlightId) ?? null)),
    [allRows, highlightId]
  );

  useEffect(() => {
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

  const orderSlots = useMemo(() => {
    if (!snapshot || corporation) return undefined;
    const ids =
      filter.characterIds.length > 0
        ? filter.characterIds
        : snapshot.openOrders.entries.map((e) => e.characterId);
    if (ids.length !== 1) return undefined;
    const entry = snapshot.openOrders.entries.find((e) => e.characterId === ids[0]);
    if (!entry) return undefined;
    return {
      used: entry.orders.length,
      breakdown: snapshot.orderSlotsByCharacter?.get(entry.characterId) ?? null,
    };
  }, [snapshot, corporation, filter.characterIds]);

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
    onOpenTurnIn: openDetails,
  });

  const sortColumn = tableSort && columns.find((c) => c.id === tableSort.columnId);
  const activeSort = sortColumn ? tableSort : null;
  const sortedRows = useMemo(
    () =>
      sortColumn && tableSort
        ? sortRows(fixList.matching, sortColumn, tableSort.direction)
        : fixList.matching,
    [fixList.matching, sortColumn, tableSort]
  );

  const csvColumns = useMemo<CsvColumn<OpenOrderRow>[]>(() => ordersCsvColumns(t), [t]);
  const ordersExport = useTableExport({
    surface: 'orders-open',
    rows: sortedRows,
    columns: csvColumns,
    source: 'rows',
  });

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

  const { workCurrentId, workCurrent, workThroughContext } = useOpenOrdersWorkThrough({
    sortedRows,
    data,
    snapshot,
    ordersByOrderId,
    rowCount: allRows.length,
  });

  const view = shownView(filter.view, workCurrent ?? (viewPicked ? null : highlightedRow));
  const modalRow = workCurrent ?? detailRow;
  const walking = workCurrent !== null;
  const [wasWalking, setWasWalking] = useState(false);
  if (walking !== wasWalking) {
    setWasWalking(walking);
    if (walking) setDetailOrderId(null);
  }
  const viewRows = useMemo(
    () => (view === 'all' ? sortedRows : sortedRows.filter((row) => rowInView(row, view))),
    [sortedRows, view]
  );

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
            characterCount={corporation ? deviceCharacterCount : entriesWithOrders.length}
            allCharacterIds={
              corporation ? undefined : entriesWithOrders.map((entry) => entry.characterId)
            }
            corporation={onChooseCorporation !== undefined}
            loading={loading && !data}
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
  const locationNamesById = new Map(
    locationOptions.map((option) => [option.locationId, option.label])
  );
  const activeFilters = activeOpenOrdersFilters(filter, t, {
    location: (locationId) =>
      locationNamesById.get(locationId) ??
      t('market.orders.filter.unknownLocation', { id: locationId }),
    character:
      characterFilterValue === 'all'
        ? (characterId) => characterNamesById.get(characterId) ?? String(characterId)
        : undefined,
  });

  const notShared = snapshot.openOrders.skipped;
  const pickerNamesMissing = showCharacterStrip && !corporation && characterFilterValue === 'all';
  const corpReauth = corporation && snapshot.corporation?.needsReauth === true;

  function pickView(next: OpenOrdersView) {
    setViewPicked(true);
    setFilter({ ...filter, view: next });
  }

  function rowContextMenu(row: OpenOrderRow, tr: ReactElement) {
    const newPrice = doThisPrice(rowFixCall(row).call);
    return (
      <ItemContextMenu
        typeId={row.typeId}
        extraItems={
          <>
            {newPrice !== null && (
              <MenuGroup id="copy">
                <MenuItem onSelect={() => void writeToClipboard(priceClipboardText(newPrice))}>
                  {t('market.orders.copyNewPrice')}
                </MenuItem>
              </MenuGroup>
            )}
            {row.stationName !== null && (
              <>
                <MenuGroup id="primary">
                  <ViewRouteMenuItem locationId={row.locationId} />
                </MenuGroup>
                <MenuGroup id="game">
                  <SetWaypointMenuItem
                    locationId={row.locationId}
                    placeName={row.stationName}
                    withViewRoute={false}
                  />
                </MenuGroup>
              </>
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
              />
            )}
          {reauthEntries.map((entry) => (
            <GrantBanner
              key={entry.characterId}
              characterId={entry.characterId}
              characterName={entry.characterName}
              endpoints={['getCharacterOrders']}
              variant="ghost"
            />
          ))}

          {corpReauth && (
            <GrantBanner characterId={activeCharacterId} endpoints={['getCorporationOrders']} />
          )}

          {fromCacheAny && <CachedNotice withBadge fetchedAt={oldestFetchedAt} />}

          {corpGrantOnly ? null : noOrders ? (
            notShared.length > 0 && snapshot.openOrders.entries.length === 0 ? null : (
              <CachedEmptyState
                result={{ fromCache: fromCacheAny }}
                title={t(corporation ? 'market.orders.corp.emptyTitle' : 'orders.emptyTitle')}
                hint={t(corporation ? 'market.orders.corp.emptyHint' : 'orders.emptyHint')}
                fetchedTitle={t(
                  corporation ? 'market.orders.corp.emptyFetchedTitle' : 'orders.emptyFetchedTitle'
                )}
                fetchedHint={corporation ? undefined : t('orders.emptyFetchedHint')}
                className="py-8"
              />
            )
          ) : (
            <>
              <FixListSummary
                orderSlots={orderSlots}
                actCount={fixList.act.length}
                actIskTiedUp={fixList.actIskTiedUp}
                {...(activeFilterCount(rowsFilter) > 0
                  ? {
                      matching: {
                        count: fixList.matching.length,
                        iskTiedUp: fixList.matchingIskTiedUp,
                      },
                    }
                  : {})}
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
                  rowAlign="end"
                  value={filter}
                  onChange={setFilter}
                  active={activeFilters}
                  resultCount={viewRows.length}
                  actions={
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
                <TableScroll className="min-w-0">
                  <DataTable
                    {...ordersExport.tableProps}
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
                </TableScroll>
              )}

              <HealthyFold
                fineCount={fixList.fine.length}
                folded={view !== 'all'}
                onShow={() => pickView('all')}
                onLegend={() => setLegendOpen(true)}
              />
            </>
          )}

          <ListNotes
            floorCharacters={floorCharacters}
            notShared={pickerNamesMissing ? [] : notShared}
          />

          {modalRow && (
            <OrderDetailModal
              key={workCurrent ? 'work-through' : modalRow.orderId}
              row={modalRow}
              snapshot={snapshot}
              detail={orderDetail}
              walking={workCurrent !== null}
              turnIn={turnIns?.offerFor(modalRow.typeId) ?? null}
              onClose={
                workCurrent ? workThroughContext.workThrough.stop : () => setDetailOrderId(null)
              }
            />
          )}
          <OrderBadgeLegend open={legendOpen} onClose={() => setLegendOpen(false)} />
        </div>
      </WorkThroughContext.Provider>
    </>
  );
}
