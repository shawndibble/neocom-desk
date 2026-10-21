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
import { SOURCE_LABEL_KEYS, waypointItemFor } from './bpcSourcingHelpers';
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
  FilterChip,
  IconButton,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  StatChips,
  textActionClassName,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';

import { activeOptionClassName } from '@/components/ui/controlStyles';
import { DEFAULT_SOURCE_TOGGLES, SOURCE_TOGGLES } from './bpcSourcingUrl';
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
import { bpcSourcingCsvColumns } from '@/features/bpcContracts/bpcSourcingCsv';
import { HintText } from '@/components/ui/HintText';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { BpoCard } from '@/features/bpcContracts/BpoCard';
import { useOfferLocations } from '@/features/contractSearch/offerLocations';
import {
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
import { cx } from '@/lib/cx';
import { bpcActiveFilterChips, type BpcFilterChip, type BpcFilterState } from './bpcActiveFilters';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';

/** Section header over each group in the sourcing strip: Cheapest by region, Market BPOs, Contract BPOs. */
const SOURCING_GROUP_HEADER =
  'pb-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * One card width for region and BPO cards alike from `sm`, so the groups
 * share a row. On a phone a region cell is narrower and the row scrolls
 * sideways rather than wrapping six cells into three rows above the offers.
 */
const REGION_CELL_WIDTH = 'w-28 shrink-0 sm:w-32';

/** A BPO card keeps the region cell's three lines; on a phone the Market and Contract groups share a two-column row instead of one full-width line each. */
const BPO_CARD_LAYOUT = 'w-full sm:w-32';

/**
 * What the Industry page header shows for this tab: when the contract snapshot
 * last synced (beside the title) and the Refresh button (beside the settings
 * gear). `null` while the tab is not mounted.
 */
export interface BpcSourcingHeaderState {
  dataAge: Date | null;
  busy: boolean;
  refresh: () => void;
}

/**
 * Public BPC contract search (issue #608, ADR 0013): searches a server-synced
 * snapshot of every publicly contracted blueprint copy for sale, across every
 * region. Not per-character — read-only, cached for offline.
 *
 * Industry's third tab rather than its own route: a BPC is an industry input,
 * ME/TE/runs are industry vocabulary (and are literally `BuildPlanRecord`'s
 * own fields), and the thing you do after finding one is run a job. It loads
 * its own snapshot rather than joining Industry's, because the two share no
 * data — this one is global and R2-backed, Industry's is per-character
 * and ESI-backed.
 */
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

  /** The row whose contract detail is open, if any. */
  const [openRow, setOpenRow] = useState<BpcContractRow | null>(null);
  // The Community Offer whose "ask to copy…" dialog is open.
  const [askRow, setAskRow] = useState<Extract<BpcSearchRow, { source: 'community' }> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Retry can unmount into the spinner: focus waits on the always-mounted card wrapper.
  const [cardRef, , holdRetryFocus] = useRetryFocus(
    loading
      ? 'busy'
      : error || (contractsResult === null && ownedBlueprints.length === 0)
        ? 'failed'
        : 'ok',
    activeCharacterId
  );
  const lastSyncedAt = contractsResult?.data?.lastSyncedAt ?? null;
  useEffect(() => {
    onHeaderChange?.({
      dataAge: lastSyncedAt ? new Date(lastSyncedAt) : null,
      busy: loading,
      refresh: refreshAll,
    });
    return () => onHeaderChange?.(null);
  }, [onHeaderChange, lastSyncedAt, loading, refreshAll]);

  const {
    suggestions,
    filteredRows,
    bpoSourcesByType,
    bpoByType,
    displayRows,
    summary,
    awaiting: awaitingOffers,
  } = useBpcRows({
    uiFilter,
    selectedTypeId,
    sources,
    activeSpaceKinds,
    allowedSystems: jumpFilter.allowed,
    sourceData,
  });

  const selectedName =
    selectedTypeId === null ? null : (blueprintNames.get(selectedTypeId) ?? `#${selectedTypeId}`);

  // The suggestion list is an inline ARIA combobox, the same hand-built
  // pattern as BuildLocationPicker: focus stays in the search box, arrow keys
  // move a highlight, Enter picks it, Escape hides the list. The highlight is
  // clamped rather than reset when a filter change shrinks the list.
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
    // ArrowDown brings an Escape-dismissed list back, as a combobox does.
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

  /** Picking from the autocomplete puts the blueprint's full name in the box, the way a combobox does — the field keeps showing what is being filtered on. */
  function selectBlueprint(suggestion: BlueprintSuggestion) {
    setParams({
      'sourcing.type': suggestion.typeId,
      'sourcing.q': suggestion.name,
    });
  }

  function clearBlueprint() {
    setParams({ 'sourcing.type': null, 'sourcing.q': '' });
  }

  const filterState: BpcFilterState = {
    filter: uiFilter,
    sources,
    spaceKinds: spaceFilter,
    jumps,
  };
  const hideDefaults = { hideAuctions: hideAuctionsDefault, hidePlex: hidePlexDefault };
  const activeChips = bpcActiveFilterChips(filterState, hideDefaults);

  /** Writes a whole filter state back: the URL group, then the Space preference. */
  function applyFilterState(next: BpcFilterState) {
    changeFilter(next.filter);
    if (next.sources !== sources || next.jumps !== jumps) {
      setParams({ 'sourcing.src': next.sources, 'sourcing.jumps': next.jumps });
    }
    if (next.spaceKinds !== spaceFilter) void setSpaceFilter(next.spaceKinds);
  }

  function filterChipLabel(chip: BpcFilterChip): string {
    switch (chip.id) {
      case 'region':
        return regionNames.get(chip.value) ?? `#${chip.value}`;
      case 'jumps':
        return t(`jumpRange.option.${chip.value}`);
      case 'minMe':
      case 'minTe':
      case 'minRuns':
      case 'maxPrice':
        return t(`bpcContracts.chips.${chip.id}`, { value: chip.value });
      case 'hideAuctions':
      case 'hidePlex':
        return t(`bpcContracts.chips.${chip.id}`);
      case 'sources':
        // Names for a short pick; a count for a long one, which would
        // otherwise run the chip off the edge of a phone.
        return chip.value.length <= 2
          ? t('bpcContracts.chips.sources', {
              list: chip.value.map((source) => t(SOURCE_LABEL_KEYS[source])).join(', '),
            })
          : t('bpcContracts.chips.sourcesCount', {
              count: chip.value.length,
              total: SOURCE_TOGGLES.length,
            });
      case 'space':
        return t('bpcContracts.chips.space', {
          list: chip.value.map((kind) => t(`common.spaceOption.${kind}`)).join(', '),
        });
    }
  }

  /** Includes the Dexie-backed space filter — unlike the sourcing.* params here, nothing else resets it. */
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

  /** Editing the text drops the pinned blueprint — otherwise the box would show one name while the table filtered on another. */
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

  // The market region may hold no contract listing, so `regionNames` may not name it.
  const [marketRegionName, setMarketRegionName] = useState<{ id: number; name: string } | null>(
    null
  );
  useEffect(() => {
    if (marketRegionId === null || regionNames.has(marketRegionId)) return;
    let cancelled = false;
    void loadRegionName(marketRegionId)
      .then((name) => {
        if (!cancelled && name) setMarketRegionName({ id: marketRegionId, name });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [marketRegionId, regionNames]);
  const regionLabel = useCallback(
    (id: number) =>
      regionNames.get(id) ?? (marketRegionName?.id === id ? marketRegionName.name : `#${id}`),
    [regionNames, marketRegionName]
  );
  const marketRegionLabel = marketRegionId === null ? null : regionLabel(marketRegionId);

  // An owned blueprint's `location_id` can be a container or ship; it only
  // resolved to a name because it is a station or structure, so only then is
  // it somewhere a waypoint can go.
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
  // System + security for each card, the same local SDE lookup Item Offers uses.
  const bpoCardLocations = useOfferLocations(selectedBpoCards);
  // The copy the CHEAPEST chip would quote, if it has an honest price to
  // compare a BPO with — so a card never claims "may be cheaper" against a
  // bundle's or barter's price.
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
  // The regions a pilot prices against, not every region the blueprint is
  // listed in (`baselineRegions`): The Forge, their market hub's, the nearest
  // hub's, and where they are when one of those coincides: three at most.
  // Hidden under a Region filter, which already narrows the rows to one.
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
  // One accent for the whole row: the cheapest region cell, or a BPO card
  // only when it is strictly the cheapest box shown (the row needs two boxes).
  const cheapestCard = cheapestSourcingCard(cheapestRegionId?.price ?? null, selectedBpoCards);
  // A hub's region is named already; the pilot's own region may have no
  // contract to name it, so its name is read from the SDE like the market region's.
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

  const { bpcColumnsById, columns, shownRows, sortProps } = useBpcColumns({
    blueprintNames,
    regionNames,
    reactionFormulaTypeIds,
    selectedTypeId,
    visibleColumns,
    displayRows,
    bpoByType,
    bpcRowJumps,
    solarSystems,
    bpoLocationName,
    regionLabel,
    onAsk: setAskRow,
  });

  // Item plus the visible columns, like the table itself.
  const csvColumns = useMemo(
    () =>
      bpcSourcingCsvColumns(
        t,
        {
          nameFor: (typeId) => blueprintNames.get(typeId) ?? `#${typeId}`,
          regionName: (regionId) => regionNames.get(regionId) ?? `#${regionId}`,
          jumpsFor: (row) => {
            const cell = bpcRowJumps(row);
            return cell.kind === 'value' ? cell.count : null;
          },
        },
        visibleColumns
      ),
    [t, blueprintNames, regionNames, bpcRowJumps, visibleColumns]
  );
  const sourcingExport = useTableExport({
    surface: 'bpc-sourcing',
    // Every match in the table's order, not just the `RESULT_LIMIT` it mounts.
    rows: displayRows,
    source: 'sorted-rows',
    columns: csvColumns,
  });

  if (!hydrated || activeCharacterId === null) {
    // No redirect of its own: the Industry route this sits in already sends a
    // characterless visitor to /characters, and a second `Navigate` racing it
    // from inside a tab is how you get a redirect loop.
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
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
    // No header of its own: the tab above already reads "BPC Search", the
    // data age sits beside the page title and Refresh beside the settings
    // gear (`onHeaderChange`). The table keeps its accessible name from
    // `bpcContracts.title`.
    <>
      <h2 ref={cardRef} tabIndex={-1} className="sr-only focus:outline-none">
        {t('bpcContracts.title')}
      </h2>
      <LiveStatus>
        {/* What the visible branch below says. */}
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
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : contractsResult === null && ownedBlueprints.length === 0 ? (
          // The public index was unreachable and nothing is cached, and there are
          // no owned blueprints to search either: not "no listings synced yet".
          <LoadFailedState
            title={t('common.contractIndexUnreachableTitle')}
            hint={t('common.contractIndexUnreachableHint')}
            onRetry={() => {
              holdRetryFocus();
              refreshAll();
            }}
          />
        ) : rows.length === 0 && originals.length === 0 && ownedBlueprints.length === 0 ? (
          // Nothing to search from either source — distinct from
          // `noFilterMatches` below, which is "some data exists, the filter
          // just excludes it all."
          <EmptyState title={t('bpcContracts.emptyTitle')} hint={t('bpcContracts.emptyHint')} />
        ) : (
          <>
            {contractsResult?.fromCache && (
              <CachedNotice className="px-3 pt-2" fetchedAt={contractsResult.fetchedAt} />
            )}
            {contractsResult === null && (
              // Owned blueprints still list, but no public offers came back.
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
            {activeChips.length > 0 && (
              // Phone only: from `md` up every filter sits inline in the bar
              // above, so it already shows what it is set to. Below it they
              // hide in the funnel's sheet, where a count badge was the only
              // sign any was on.
              <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-1.5 md:hidden">
                {activeChips.map((chip) => (
                  <FilterChip
                    key={chip.id}
                    label={filterChipLabel(chip)}
                    selected
                    className="shrink-0"
                    onToggle={() => applyFilterState(chip.clear(filterState))}
                  />
                ))}
                <button
                  type="button"
                  className={cx(textActionClassName(), 'shrink-0 whitespace-nowrap')}
                  onClick={() =>
                    applyFilterState(
                      activeChips.reduce((state, chip) => chip.clear(state), filterState)
                    )
                  }
                >
                  {t('bpcContracts.chips.clearAll')}
                </button>
              </div>
            )}
            {/* Outside the bar: collapsed, its controls unmount, and this is
              exactly when the pilot needs telling the range is not applied. */}
            {(jumpFilter.status === 'no-origin' || jumpFilter.status === 'unknown') && (
              <div className="border-b border-line px-3 py-2">
                <JumpRangeNote status={jumpFilter.status} />
              </div>
            )}

            {/* Inset on its own ground with an accent edge, because as a plain
              list flush against the filter bar it read as more page furniture
              and went unnoticed — the whole feature hangs on picking from it. */}
            {/* Always mounted, so the count is announced when the list appears. */}
            <span role="status" aria-live="polite" className="sr-only">
              {openSuggestions !== null &&
                (highlightedSuggestion
                  ? t('bpcContracts.suggestionsHighlighted', {
                      count: openSuggestions.length,
                      name: highlightedSuggestion.name,
                    })
                  : t('bpcContracts.suggestionsCount', { count: openSuggestions.length }))}
            </span>
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
                      // Keeps focus in the search box, so a click never blurs it first.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectBlueprint(suggestion)}
                      className={cx(
                        'flex min-h-11 w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-1.5 text-left text-sm last:border-b-0 md:min-h-9',
                        suggestion === highlightedSuggestion
                          ? `bg-panel-2 ${activeOptionClassName}`
                          : 'hover:bg-panel-2'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
                      {/* Hidden on the narrowest screens rather than wrapped: three
                          columns in a 390px row squeezes the name, which is the
                          one part that has to stay readable. */}
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
              // Name and close share the first line on a phone; the stats strip
              // wraps beneath instead of the close button taking a line of its own.
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                <div className="min-w-0 max-sm:flex-1">
                  <p className="truncate text-base font-semibold">{selectedName}</p>
                  {/* The phone's sort bar counts the offers instead. */}
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
              // One wrapping row: [Cheapest by region] [Market BPOs] [Contract BPOs],
              // every card the same width; on a phone the region cells take the
              // first line (scrolling sideways) and the two BPO groups share the
              // next in two columns. A group with no card is left out.
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-b border-line px-3 py-2 sm:flex sm:flex-row sm:flex-wrap sm:gap-x-4">
                {regionCells.length > 0 && (
                  <div className="col-span-2 min-w-0 max-w-full">
                    <p className={SOURCING_GROUP_HEADER}>{t('bpcContracts.cheapestByRegion')}</p>
                    {/* A fixed order (The Forge first), so a cell stays where the pilot
                    looks for it; the accent marks the cheapest. Hovering a name says
                    why the region is here. */}
                    {/* `relative` makes the row the containing block of each
                    price's absolutely positioned screen-reader text
                    (`IskAmount`'s `sr-only`). Without it that text escaped
                    the row's scroll clip and the whole page scrolled
                    sideways on a phone, not just this row. */}
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
                            {/* Price and offer count share a line: two lines a cell, not three. */}
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
              <div className="flex justify-center py-16">
                <Spinner label={t('common.loading')} />
              </div>
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
              <>
                <DataTable
                  {...sourcingExport.tableProps}
                  label={t('bpcContracts.title')}
                  columns={columns}
                  rows={shownRows}
                  // Index included deliberately: a contract lists the same
                  // blueprint once per copy, so contractId+typeId is not
                  // unique — 70% of rows in a live pull shared one, and the
                  // duplicate React keys left the previous blueprint's rows
                  // in the table beside the chosen one. An owned row's
                  // item_id is already unique on its own.
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
                  // A two-line card per offer on a phone — price at the right of
                  // the title line, everything else on one dim line under it —
                  // and a sort picker, since the header row it would sort from
                  // is gone. The cap above follows that same sort.
                  stackLayout="dense"
                  // Name, price and the More actions button centred on one
                  // line, the button's 44px touch target no longer making that
                  // line button-tall (Hauling's opt-in, `index.css`).
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
                  // A contract row opens its contract; a market row opens the
                  // item's Market entry. Owned and Community rows have no
                  // contract: nothing to open.
                  rowClickable={(row) => row.source !== 'community'}
                  onRowClick={(row) => {
                    if (row.source === 'community') return;
                    if (row.source === 'lp') {
                      // The store, with this offer picked; `affordableOnly=0` so an
                      // offer the pilot can't yet afford is not filtered out of view.
                      navigate(
                        `/wallet/lp-store/${row.corporationId}?${new URLSearchParams({ offer: String(row.offerId), affordableOnly: '0' })}`
                      );
                      return;
                    }
                    if (row.source === 'market') {
                      const params = marketLinkParams(row.typeId, location.search);
                      navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
                      return;
                    }
                    if (row.source === 'owned') {
                      // No contract to open: start a Build Plan from the owned
                      // blueprint, seeded with its own ME/TE/runs.
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
                  rowContextMenu={(row, tr) => (
                    // The Offer's own ME/TE/runs, not the defaults, so a pilot
                    // shopping a specific copy sees what *that* copy builds. A
                    // BPO's -1 runs falls back to the unseeded default instead
                    // of a fabricated run count.
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
                  // At most RESULT_LIMIT rows, but a phone still mounts only a screenful.
                  virtualize
                />
              </>
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
            // Every listed copy, not the filtered board: a tight ME, price or region
            // filter must not shrink the pool a fair price is judged against.
            comparables={sourceData.contractRows}
            // Non-null past the `activeCharacterId === null` guard above; the
            // modal needs one to resolve a player-structure location, whose ACL
            // is per Character (#655 item F).
            characterId={activeCharacterId}
            blueprintName={blueprintNames.get(openRow.typeId) ?? `#${openRow.typeId}`}
            regionName={regionNames.get(openRow.regionId) ?? `#${openRow.regionId}`}
            onClose={() => setOpenRow(null)}
          />
        )}
      </Panel>
      {/* One quiet line just under the card: what the list was capped to and
        which market was checked. The cap follows the phone's sort bar
        (`stackSummary`) there, so it is left off at that width. Only where
        the table itself shows, never under a spinner or an error. */}
      {showsTable && (marketNote !== null || capNote !== null) && (
        <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
          {capNote !== null && <span className="max-sm:hidden">{capNote} </span>}
          {marketNote}
        </p>
      )}
    </>
  );
}
