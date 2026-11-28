import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BpcFilterBar, type UiFilter } from './BpcFilterBar';
import { waypointItemFor } from './bpcSourcingHelpers';
import { useBpcSourcingData } from './useBpcSourcingData';
import { useBpcRows } from './useBpcRows';
import { useBpcColumns } from './useBpcColumns';
import { useLocation, useNavigate } from 'react-router-dom';
import { marketLinkParams } from '@/engine/market/urlState';
import { industryTabHref } from '@/features/industry/industryTabs';
import { loadPlannableIndex, plannableProductTypeID } from '@/features/industry/plannableProduct';
import { applyPlanSeed } from '@/features/industry/planSeed';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  LiveStatus,
  LoadFailedState,
  IconButton,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  StatChips,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';

import { activeOptionClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { DEFAULT_SOURCE_TOGGLES } from './bpcSourcingUrl';
import {
  asContract,
  cheapestByRegion,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { SPACE_KINDS } from '@/engine/space';
import { AskToCopyDialog } from '@/features/communities/AskToCopyDialog';
import { type BlueprintSuggestion } from '@/features/bpcContracts/searchBpcOffers';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { BPC_SEARCH_COLUMN_IDS } from '@/features/bpcContracts/bpcSearchColumns';
import { BpcContractModal } from '@/features/bpcContracts/BpcContractModal';
import { bpcPeerDiffs } from '@/engine/contracts/bpcPerRunCheck';
import { bpcSourcingCsvColumns, type BpcBpoBadge } from '@/features/bpcContracts/bpcSourcingCsv';
import { HintText } from '@/components/ui/HintText';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { BpoCard } from '@/features/bpcContracts/BpoCard';
import { useOfferLocations } from '@/features/contractSearch/offerLocations';
import {
  bpoBadgeRows,
  bpoMayBeCheaper,
  cheapestComparableCopy,
  cheapestSourcingCard,
  MARKET_BPO_LOOKUP_LIMIT,
  type BpoOffer,
} from '@/features/bpcContracts/bpoAvailability';
import { TRADE_HUBS } from '@/market/hubs';
import { baselineRegions, nearestHub } from '@/engine/contracts/baselineRegions';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { JumpRangeNote } from '@/features/route/JumpRangeControls';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { cx } from '@/lib/cx';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { TableScroll } from '@/components/ui/TableScroll';

const SOURCING_GROUP_HEADER = `pb-2 ${eyebrowClassName}`;

const REGION_CELL_WIDTH = 'w-28 shrink-0 sm:w-32';

const BPO_CARD_LAYOUT = 'w-full sm:w-32';

export interface BpcSourcingHeaderState {
  dataAge: Date | null;
  busy: boolean;
  refresh: () => void;
}

export function BpcSourcingPanel({
  onHeaderChange,
}: {
  onHeaderChange?: (state: BpcSourcingHeaderState | null) => void;
} = {}) {
  const { t } = useTranslation();
  const {
    data,
    error,
    loading,
    hydrated,
    activeCharacterId,
    refreshAll,
    contractsResult,
    blueprintNames,
    reactionFormulaTypeIds,
    regionNames,
    ownedBlueprints,
    contractLocations,
    ownedLocations,
    rows,
    originals,
    spaceFilter,
    setSpaceFilter,
    visibleColumns,
    toggleColumn,
    hideAuctionsDefault,
    hidePlexDefault,
    setParams,
    uiFilter,
    sources,
    jumps,
    selectedTypeId,
    currentSystem,
    jumpFilter,
    solarSystems,
    bpcRowJumps,
    marketHub,
    marketLookup,
    marketRegionId,
    market,
    activeSpaceKinds,
    sourceData,
  } = useBpcSourcingData();

  const [openRow, setOpenRow] = useState<BpcContractRow | null>(null);
  const [askRow, setAskRow] = useState<Extract<BpcSearchRow, { source: 'community' }> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const rowRouteHref = (row: BpcSearchRow): string | undefined => {
    if (row.source === 'lp') {
      return `/wallet/lp-store/${row.corporationId}?${new URLSearchParams({ offer: String(row.offerId), affordableOnly: '0' })}`;
    }
    if (row.source === 'market') {
      return `/market/browser?${new URLSearchParams(marketLinkParams(row.typeId, location.search)).toString()}`;
    }
    return undefined;
  };

  const [cardRef, , holdRetryFocus] = useRetryFocus(
    loading
      ? 'busy'
      : error || (contractsResult === null && ownedBlueprints.length === 0)
        ? 'failed'
        : 'ok',
    activeCharacterId
  );
  const {
    suggestions,
    filteredRows,
    bpoSourcesByType,
    bpoByType,
    displayRows,
    summary,
    awaiting: awaitingOffers,
    refreshing: refreshingOffers,
  } = useBpcRows({
    uiFilter,
    selectedTypeId,
    sources,
    activeSpaceKinds,
    allowedSystems: jumpFilter.allowed,
    sourceData,
  });

  const lastSyncedAt = contractsResult?.data?.lastSyncedAt ?? null;
  useEffect(() => {
    onHeaderChange?.({
      dataAge: lastSyncedAt ? new Date(lastSyncedAt) : null,
      busy: loading || refreshingOffers,
      refresh: refreshAll,
    });
    return () => onHeaderChange?.(null);
  }, [onHeaderChange, lastSyncedAt, loading, refreshingOffers, refreshAll]);

  const selectedName =
    selectedTypeId === null ? null : (blueprintNames.get(selectedTypeId) ?? `#${selectedTypeId}`);

  const suggestionIdPrefix = useId();
  const suggestionListboxId = `${suggestionIdPrefix}-listbox`;
  const suggestionOptionId = (typeId: number) => `${suggestionIdPrefix}-option-${typeId}`;
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const openSuggestions = !suggestionsDismissed && suggestions.length > 0 ? suggestions : null;
  const highlightedSuggestion =
    openSuggestions !== null && highlightedIndex !== null
      ? (openSuggestions[Math.min(highlightedIndex, openSuggestions.length - 1)] ?? null)
      : null;

  function handleSuggestionKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (openSuggestions === null) {
      if (e.key === 'ArrowDown' && suggestionsDismissed && suggestions.length > 0) {
        e.preventDefault();
        setSuggestionsDismissed(false);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        e.preventDefault();
        setHighlightedIndex((current) =>
          moveHighlight(
            e.key as ComboboxNavKey,
            current === null ? null : Math.min(current, openSuggestions.length - 1),
            openSuggestions.length
          )
        );
        break;
      case 'Enter':
        if (highlightedSuggestion !== null) {
          e.preventDefault();
          selectBlueprint(highlightedSuggestion);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSuggestionsDismissed(true);
        setHighlightedIndex(null);
        break;
    }
  }

  const searchComboboxProps: InputHTMLAttributes<HTMLInputElement> = {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': openSuggestions !== null,
    'aria-controls': suggestionListboxId,
    'aria-activedescendant': highlightedSuggestion
      ? suggestionOptionId(highlightedSuggestion.typeId)
      : undefined,
    onKeyDown: handleSuggestionKeyDown,
  };

  function selectBlueprint(suggestion: BlueprintSuggestion) {
    setParams({
      'sourcing.type': suggestion.typeId,
      'sourcing.q': suggestion.name,
    });
  }

  function clearBlueprint() {
    setParams({ 'sourcing.type': null, 'sourcing.q': '' });
  }

  const hideDefaults = { hideAuctions: hideAuctionsDefault, hidePlex: hidePlexDefault };

  function resetSourcingFilters() {
    changeFilter({
      typeQuery: '',
      regionId: null,
      minMe: '',
      minTe: '',
      minRuns: '',
      maxPrice: '',
      hideAuctions: hideAuctionsDefault,
      hidePlex: hidePlexDefault,
    });
    setParams({
      'sourcing.src': new Set(DEFAULT_SOURCE_TOGGLES),
      'sourcing.jumps': DEFAULT_JUMP_RANGE,
    });
    void setSpaceFilter(SPACE_KINDS);
  }

  function changeFilter(next: UiFilter) {
    if (next.typeQuery !== uiFilter.typeQuery) {
      setHighlightedIndex(null);
      setSuggestionsDismissed(false);
    }
    setParams({
      ...(next.typeQuery !== uiFilter.typeQuery ? { 'sourcing.type': null } : {}),
      'sourcing.q': next.typeQuery,
      'sourcing.region': next.regionId,
      'sourcing.minMe': next.minMe,
      'sourcing.minTe': next.minTe,
      'sourcing.minRuns': next.minRuns,
      'sourcing.maxPrice': next.maxPrice,
      'sourcing.hideAuctions': next.hideAuctions,
      'sourcing.hidePlex': next.hidePlex,
    });
  }
  const regionOptions = useMemo(
    () =>
      [...new Set([...rows, ...originals].map((r) => r.regionId))].map((id) => ({
        id,
        name: regionNames.get(id) ?? `#${id}`,
      })),
    [rows, originals, regionNames]
  );

  const unnamedMarketRegionId =
    marketRegionId === null || regionNames.has(marketRegionId) ? null : marketRegionId;
  const loadMarketRegionName = useCallback(
    () => loadRegionName(unnamedMarketRegionId ?? 0),
    [unnamedMarketRegionId]
  );
  const marketRegionName = useKeyedLoad(
    unnamedMarketRegionId === null ? null : String(unnamedMarketRegionId),
    loadMarketRegionName
  ).data;
  const regionLabel = useCallback(
    (id: number) =>
      regionNames.get(id) ??
      (id === marketRegionId && marketRegionName ? marketRegionName : `#${id}`),
    [regionNames, marketRegionId, marketRegionName]
  );
  const marketRegionLabel = marketRegionId === null ? null : regionLabel(marketRegionId);

  const ownedPlaceIds = useMemo(
    () =>
      new Map(
        ownedBlueprints.flatMap((bp): [number, number][] =>
          ownedLocations.get(bp.location_id)?.name != null ? [[bp.item_id, bp.location_id]] : []
        )
      ),
    [ownedBlueprints, ownedLocations]
  );
  const selectedBpoSources =
    selectedTypeId === null ? undefined : bpoSourcesByType.get(selectedTypeId);
  const selectedMarketBpo = selectedBpoSources?.market ?? null;
  const selectedContractBpo = selectedBpoSources?.contract ?? null;
  const selectedBpoCards = useMemo(
    () => [selectedMarketBpo, selectedContractBpo].filter((bpo): bpo is BpoOffer => bpo !== null),
    [selectedMarketBpo, selectedContractBpo]
  );
  const bpoCardLocations = useOfferLocations(selectedBpoCards);
  const cheapestCopy = useMemo(
    () => (selectedTypeId === null ? null : cheapestComparableCopy(filteredRows)),
    [selectedTypeId, filteredRows]
  );
  const bpoLocationName = useCallback(
    (bpo: BpoOffer) =>
      (bpo.kind === 'market'
        ? market.locations.get(bpo.locationId)?.name
        : contractLocations.get(bpo.locationId)?.name) ?? null,
    [market.locations, contractLocations]
  );
  const nearestHubRegionId = nearestHub(TRADE_HUBS, jumpFilter.jumps)?.regionId ?? null;
  const currentRegionId =
    currentSystem.systemId === null
      ? null
      : (solarSystems?.get(currentSystem.systemId)?.regionId ?? null);
  const regionCells = useMemo(() => {
    if (selectedTypeId === null || uiFilter.regionId !== null) return [];
    const priced = new Map(cheapestByRegion(filteredRows).map((r) => [r.regionId, r]));
    return baselineRegions({
      hubRegionId: marketHub.regionId,
      nearestHubRegionId,
      currentRegionId,
    }).map((baseline) => ({ ...baseline, listing: priced.get(baseline.regionId) ?? null }));
  }, [
    selectedTypeId,
    uiFilter.regionId,
    filteredRows,
    marketHub.regionId,
    nearestHubRegionId,
    currentRegionId,
  ]);
  const cheapestRegionId = regionCells.reduce<{ regionId: number; price: number } | null>(
    (best, cell) =>
      cell.listing !== null && (best === null || cell.listing.cheapest < best.price)
        ? { regionId: cell.regionId, price: cell.listing.cheapest }
        : best,
    null
  );
  const cheapestCard = cheapestSourcingCard(cheapestRegionId?.price ?? null, selectedBpoCards);
  const [loadedRegionNames, setLoadedRegionNames] = useState<ReadonlyMap<number, string>>(
    new Map()
  );
  const unnamedCellRegionIds = regionCells
    .map((cell) => cell.regionId)
    .filter(
      (id) =>
        !regionNames.has(id) &&
        !loadedRegionNames.has(id) &&
        !TRADE_HUBS.some((hub) => hub.regionId === id)
    );
  const unnamedKey = unnamedCellRegionIds.join();
  useEffect(() => {
    if (unnamedKey === '') return;
    let cancelled = false;
    for (const id of unnamedKey.split(',').map(Number)) {
      void loadRegionName(id)
        .then((name) => {
          if (!cancelled && name) setLoadedRegionNames((prev) => new Map(prev).set(id, name));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [unnamedKey]);
  const baselineRegionName = (regionId: number) =>
    regionNames.get(regionId) ??
    TRADE_HUBS.find((hub) => hub.regionId === regionId)?.regionName ??
    loadedRegionNames.get(regionId) ??
    `#${regionId}`;

  const peerDiffOf = useMemo(
    () => bpcPeerDiffs(sourceData.contractRows),
    [sourceData.contractRows]
  );

  const { bpcColumnsById, columns, shownRows, sortProps } = useBpcColumns({
    blueprintNames,
    regionNames,
    reactionFormulaTypeIds,
    selectedTypeId,
    visibleColumns,
    displayRows,
    peerDiffOf,
    bpoByType,
    bpcRowJumps,
    solarSystems,
    bpoLocationName,
    regionLabel,
    onAsk: setAskRow,
  });

  const bpoBadges = useMemo(() => {
    const badges = new Map<BpcSearchRow, BpcBpoBadge>();
    if (selectedTypeId !== null) return badges;
    for (const row of bpoBadgeRows(displayRows)) {
      const bpo = bpoByType.get(row.typeId);
      if (!bpo) continue;
      badges.set(row, {
        price: bpo.price,
        locationName: bpoLocationName(bpo),
        regionName: regionLabel(bpo.regionId),
        mayBeCheaper: row.source === 'contract' && bpoMayBeCheaper(bpo, row.contract),
      });
    }
    return badges;
  }, [selectedTypeId, displayRows, bpoByType, bpoLocationName, regionLabel]);
  const csvColumns = useMemo(
    () =>
      bpcSourcingCsvColumns(t, {
        nameFor: (typeId) => blueprintNames.get(typeId) ?? `#${typeId}`,
        regionName: (regionId) => regionNames.get(regionId) ?? `#${regionId}`,
        jumpsFor: (row) => {
          const cell = bpcRowJumps(row);
          return cell.kind === 'value' ? cell.count : null;
        },
        securityFor: (row) =>
          row.systemId == null ? null : (solarSystems?.get(row.systemId)?.security ?? null),
        peerDiffFor: peerDiffOf,
        bpoBadges,
      }),
    [t, blueprintNames, regionNames, bpcRowJumps, solarSystems, bpoBadges, peerDiffOf]
  );
  const sourcingExport = useTableExport({
    surface: 'bpc-sourcing',
    rows: displayRows,
    source: 'sorted-rows',
    columns: csvColumns,
  });

  if (!hydrated || activeCharacterId === null) {
    return <Spinner block="page" label={t('common.loading')} />;
  }

  const showsTable =
    !(loading && !data) &&
    !error &&
    !(rows.length === 0 && originals.length === 0 && ownedBlueprints.length === 0);
  const capNote =
    sources.size > 0 && displayRows.length > shownRows.length
      ? t('bpcContracts.resultsCapped', {
          shown: formatCount(shownRows.length),
          total: formatCount(displayRows.length),
        })
      : null;
  const marketNoteApplies = marketLookup.typeIds.length > 0 || sources.has('market');
  const marketNote = !marketNoteApplies
    ? null
    : marketLookup.typeIds.length === 0 || marketRegionId === null
      ? t('bpcContracts.marketScopeNeedsSearch')
      : [
          market.loading
            ? t('bpcContracts.marketScopeChecking')
            : uiFilter.regionId === null
              ? t('bpcContracts.marketScopeHub', { hub: marketHub.systemName })
              : t('bpcContracts.marketScopeRegion', { region: marketRegionLabel }),
          market.failedTypeIds.size > 0
            ? t('bpcContracts.marketScopeFailed', { count: market.failedTypeIds.size })
            : null,
          marketLookup.capped
            ? t('bpcContracts.marketScopeCapped', { count: MARKET_BPO_LOOKUP_LIMIT })
            : null,
        ]
          .filter(Boolean)
          .join(' ');

  return (
    <>
      <h2 ref={cardRef} tabIndex={-1} className="sr-only focus:outline-none">
        {t('bpcContracts.title')}
      </h2>
      <LiveStatus>
        {loading
          ? ''
          : error
            ? t('common.loadFailedTitle')
            : contractsResult === null
              ? t('common.contractIndexUnreachableTitle')
              : ''}
      </LiveStatus>
      <Panel padded={false}>
        {loading && !data ? (
          <Spinner block="page" label={t('common.loading')} />
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : contractsResult === null && ownedBlueprints.length === 0 ? (
          <LoadFailedState
            title={t('common.contractIndexUnreachableTitle')}
            hint={t('common.contractIndexUnreachableHint')}
            onRetry={() => {
              holdRetryFocus();
              refreshAll();
            }}
          />
        ) : rows.length === 0 && originals.length === 0 && ownedBlueprints.length === 0 ? (
          <EmptyState title={t('bpcContracts.emptyTitle')} hint={t('bpcContracts.emptyHint')} />
        ) : (
          <>
            {contractsResult?.fromCache && (
              <CachedNotice className="px-3 pt-2" fetchedAt={contractsResult.fetchedAt} />
            )}
            {contractsResult === null && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {t('common.contractIndexUnreachableTitle')}
              </p>
            )}
            <BpcFilterBar
              filter={uiFilter}
              onChange={changeFilter}
              hideDefaults={hideDefaults}
              regionOptions={regionOptions}
              sources={sources}
              onSourcesChange={(next) => setParams({ 'sourcing.src': next })}
              spaceKinds={spaceFilter}
              onSpaceKindsChange={(next) => void setSpaceFilter(next)}
              jumps={jumps}
              onJumpsChange={(next) => setParams({ 'sourcing.jumps': next })}
              currentSystem={currentSystem}
              searchComboboxProps={searchComboboxProps}
              {...(!awaitingOffers && { resultCount: displayRows.length })}
              actions={
                <>
                  <ColumnPickerMenu
                    available={BPC_SEARCH_COLUMN_IDS}
                    visible={visibleColumns}
                    columnsById={bpcColumnsById}
                    onToggle={toggleColumn}
                    buttonLabel={t('bpcContracts.columnsButton')}
                    menuTitle={t('bpcContracts.columnsMenuTitle')}
                  />
                  {displayRows.length > 0 && (
                    <TableActionsMenu
                      name={t('bpcContracts.title')}
                      tableExport={sourcingExport}
                      size="md"
                    />
                  )}
                </>
              }
            />
            {(jumpFilter.status === 'no-origin' || jumpFilter.status === 'unknown') && (
              <div className="border-b border-line px-3 py-2">
                <JumpRangeNote status={jumpFilter.status} />
              </div>
            )}

            <LiveStatus>
              {openSuggestions !== null &&
                (highlightedSuggestion
                  ? t('bpcContracts.suggestionsHighlighted', {
                      count: openSuggestions.length,
                      name: highlightedSuggestion.name,
                    })
                  : t('bpcContracts.suggestionsCount', { count: openSuggestions.length }))}
            </LiveStatus>
            {openSuggestions !== null && (
              <div className="border-b border-line bg-panel-2 px-3 py-2">
                <p className={cx(eyebrowClassName, 'pb-1.5')}>
                  {t('bpcContracts.suggestionsHeading')}
                </p>
                <ul
                  id={suggestionListboxId}
                  role="listbox"
                  aria-label={t('bpcContracts.suggestionsLabel')}
                  className="max-h-72 overflow-y-auto rounded-xs border border-line-bright bg-panel"
                >
                  {openSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.typeId}
                      id={suggestionOptionId(suggestion.typeId)}
                      role="option"
                      aria-selected={suggestion === highlightedSuggestion}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectBlueprint(suggestion)}
                      className={cx(
                        'flex min-h-9 w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-1.5 text-left text-sm last:border-b-0',
                        suggestion === highlightedSuggestion
                          ? `bg-panel-2 ${activeOptionClassName}`
                          : rowInteractiveClassName
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
                      <span className="hidden shrink-0 text-[0.6875rem] tabular-nums text-text-dim sm:inline">
                        {t('bpcContracts.suggestionBestMeTe', {
                          me: suggestion.bestMe,
                          te: suggestion.bestTe,
                        })}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">
                        {t('bpcContracts.regionOffers', { count: suggestion.offerCount })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedName !== null && summary !== null && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                <div className="min-w-0 max-sm:flex-1">
                  <p className="truncate text-base font-semibold">{selectedName}</p>
                  <p className="text-[0.6875rem] text-text-dim max-sm:hidden">
                    {t('bpcContracts.offersOnContract', { count: summary.offerCount })}
                  </p>
                </div>
                <IconButton
                  icon={<Icon.Close />}
                  label={t('bpcContracts.clearBlueprint', { name: selectedName })}
                  tooltip={t('bpcContracts.clearBlueprintShort')}
                  size="sm"
                  className="sm:order-3"
                  onClick={clearBlueprint}
                />
                <StatChips className="max-sm:order-3 max-sm:w-full md:ml-auto">
                  {summary.cheapest !== null && (
                    <StatChip
                      emphasis
                      label={t('bpcContracts.cheapestLabel')}
                      value={<IskAmount value={summary.cheapest} />}
                    />
                  )}
                  {summary.cheapestPerRun !== null && (
                    <StatChip
                      label={t('bpcContracts.cheapestPerRunLabel')}
                      value={<IskAmount value={summary.cheapestPerRun} />}
                    />
                  )}
                  {summary.median !== null && (
                    <StatChip
                      label={t('bpcContracts.medianLabel')}
                      value={<IskAmount value={summary.median} />}
                    />
                  )}
                  {summary.bestMe !== null && summary.bestTe !== null && (
                    <StatChip
                      label={t('bpcContracts.bestMeTeLabel')}
                      value={`${summary.bestMe} / ${summary.bestTe}`}
                    />
                  )}
                </StatChips>
              </div>
            )}

            {(regionCells.length > 0 || selectedBpoCards.length > 0) && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-b border-line px-3 py-2 sm:flex sm:flex-row sm:flex-wrap sm:gap-x-4">
                {regionCells.length > 0 && (
                  <div className="col-span-2 min-w-0 max-w-full">
                    <p className={SOURCING_GROUP_HEADER}>{t('bpcContracts.cheapestByRegion')}</p>
                    <ul
                      aria-label={t('bpcContracts.cheapestByRegion')}
                      className="relative flex gap-2 max-sm:-mx-3 max-sm:overflow-x-auto max-sm:px-3 sm:flex-wrap"
                    >
                      {regionCells.map((cell) => {
                        const accent =
                          cheapestCard === 'region' && cell.regionId === cheapestRegionId?.regionId;
                        return (
                          <li
                            key={cell.regionId}
                            className={cx(
                              'flex flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-1.5',
                              REGION_CELL_WIDTH,
                              accent ? 'border-accent-dim' : 'border-line'
                            )}
                          >
                            <HintText
                              className={cx(eyebrowClassName, 'max-w-full self-start truncate')}
                              content={cell.reasons
                                .map((reason) => t(`bpcContracts.regionReason.${reason}`))
                                .join(' · ')}
                            >
                              {baselineRegionName(cell.regionId)}
                            </HintText>
                            {cell.listing === null ? (
                              <span className="text-[0.6875rem] text-text-dim">
                                {t('bpcContracts.regionNoOffers')}
                              </span>
                            ) : (
                              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                                <span
                                  className={cx('text-sm tabular-nums', accent && 'text-accent')}
                                >
                                  <IskAmount value={cell.listing.cheapest} />
                                </span>
                                <span className="truncate text-[0.6875rem] tabular-nums text-text-dim">
                                  {t('bpcContracts.regionOffers', {
                                    count: cell.listing.offerCount,
                                  })}
                                </span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {selectedBpoCards.map((bpo) => {
                  const header = t(
                    bpo.kind === 'market'
                      ? 'bpcContracts.sourceMarketBpos'
                      : 'bpcContracts.sourceContractBpos'
                  );
                  return (
                    <div key={bpo.kind} className="min-w-0 max-w-full">
                      <p className={SOURCING_GROUP_HEADER}>{header}</p>
                      <ul aria-label={header} className="flex flex-wrap gap-2">
                        <BpoCard
                          bpo={bpo}
                          mayBeCheaper={cheapestCopy !== null && bpoMayBeCheaper(bpo, cheapestCopy)}
                          cheapest={cheapestCard === bpo.kind}
                          location={bpoCardLocations.get(bpo.locationId)}
                          className={BPO_CARD_LAYOUT}
                        />
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {sources.size === 0 ? (
              <EmptyState title={t('bpcContracts.noSourceSelected')} className="py-8" />
            ) : awaitingOffers ? (
              <Spinner block="page" label={t('common.loading')} />
            ) : displayRows.length === 0 ? (
              <EmptyState
                title={t('bpcContracts.noFilterMatches')}
                hint={t('bpcContracts.noFilterMatchesHint')}
                className="py-8"
                action={
                  <Button size="sm" onClick={resetSourcingFilters}>
                    {t('common.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <TableScroll>
                <DataTable
                  {...sourcingExport.tableProps}
                  label={t('bpcContracts.title')}
                  columns={columns}
                  rows={shownRows}
                  rowKey={(row, index) =>
                    row.source === 'contract'
                      ? `${row.contract.contractId}:${row.typeId}:${index}`
                      : row.source === 'market'
                        ? `market:${row.orderId}`
                        : row.source === 'lp'
                          ? `lp:${row.corporationId}:${row.offerId}`
                          : row.source === 'community'
                            ? `community:${row.memberUid}:${row.typeId}:${row.me}:${row.te}:${row.runs}:${row.locationName}:${index}`
                            : `owned:${row.itemId}`
                  }
                  {...sortProps}
                  stackLayout="dense"
                  className="dt-dense-tight"
                  mobileSort
                  stackSummary={
                    displayRows.length > shownRows.length
                      ? t('bpcContracts.mobile.offerCountCapped', {
                          shown: formatCount(shownRows.length),
                          total: formatCount(displayRows.length),
                        })
                      : t('bpcContracts.mobile.offerCount', { count: displayRows.length })
                  }
                  rowClickable={(row) => row.source !== 'community'}
                  onRowClick={(row) => {
                    if (row.source === 'community') return;
                    const href = rowRouteHref(row);
                    if (href) {
                      navigate(href);
                      return;
                    }
                    if (row.source === 'owned') {
                      void loadPlannableIndex().then((index) => {
                        const productTypeId = plannableProductTypeID(index, row.typeId);
                        if (productTypeId === null) return;
                        const params = new URLSearchParams({ product: String(productTypeId) });
                        applyPlanSeed(
                          params,
                          row.runs === -1 || row.runs === null
                            ? null
                            : { me: row.me, te: row.te, runs: row.runs }
                        );
                        navigate(`${industryTabHref('plans')}?${params.toString()}`);
                      });
                      return;
                    }
                    setOpenRow(asContract(row));
                  }}
                  rowMoreActions
                  rowHref={rowRouteHref}
                  rowContextMenu={(row, tr) => (
                    <BuildPlanContextMenu
                      typeId={row.typeId}
                      itemName={blueprintNames.get(row.typeId)}
                      seed={
                        row.runs === -1 || row.runs === null
                          ? null
                          : { me: row.me, te: row.te, runs: row.runs }
                      }
                      trigger={tr}
                      omitViewInMarket
                      extraItems={waypointItemFor(row, ownedPlaceIds)}
                    />
                  )}
                  virtualize
                />
              </TableScroll>
            )}
          </>
        )}

        {askRow !== null && activeCharacterId !== null && (
          <AskToCopyDialog
            characterId={activeCharacterId}
            offer={askRow}
            blueprintName={blueprintNames.get(askRow.typeId) ?? `#${askRow.typeId}`}
            holderName={askRow.memberName}
            onClose={() => setAskRow(null)}
          />
        )}

        {openRow !== null && (
          <BpcContractModal
            row={openRow}
            comparables={sourceData.contractRows}
            characterId={activeCharacterId}
            blueprintName={blueprintNames.get(openRow.typeId) ?? `#${openRow.typeId}`}
            regionName={regionNames.get(openRow.regionId) ?? `#${openRow.regionId}`}
            onClose={() => setOpenRow(null)}
          />
        )}
      </Panel>
      {showsTable && (marketNote !== null || capNote !== null) && (
        <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
          {capNote !== null && <span className="max-sm:hidden">{capNote} </span>}
          {marketNote}
        </p>
      )}
    </>
  );
}
