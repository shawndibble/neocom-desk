import type { PriceSide } from '@/engine/miningTax/priceBasis';
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  CheckboxSelect,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  LoadFailedState,
  FilterBar,
  FilterChip,
  FilterField,
  IskInput,
  Panel,
  ProgressBar,
  RegionSelect,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  StatChips,
  TextInput,
  IskAmount,
  LiveNote,
  LiveStatus,
  CachedNotice,
  boundText,
  summarizeFilterValues,
  type ActiveFilter,
} from '@/components/ui';
import {
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  useVisibleContractSearchItemsColumns,
  type ContractSearchItemsColumnId,
} from '@/features/contractSearch/contractSearchItemsColumns';
import {
  contractOfferPriceSummary,
  listedContractTypeOptions,
  isUnpricedOffer,
  offerAskingPrice,
  type ContractOfferStats,
  type ContractTypeOption,
} from '@/engine/contracts/contractSearch';
import {
  bpcRowsFromContractOffers,
  type PublicContractOfferRow,
} from '@/engine/contracts/contractOffers';
import { bpcPerRunCheck } from '@/engine/contracts/bpcPerRunCheck';
import {
  contractFlagFor,
  contractSavingFor,
  splitFlagged,
  type ContractFlag,
} from '@/engine/contracts/contractFlags';
import {
  resolveCourierRoutes,
  type CourierEndpoint,
  type PublicCourierContractRow,
} from '@/engine/contracts/courierSearch';
import { loadPublicContractOffers } from '@/features/contractSearch/publicContractOffers';
import { isItemsSearchActive } from '@/features/contractSearch/itemsSearchActive';
import { useEarlyOffers, useOfferIndex } from '@/features/contractSearch/useIndexedOffers';
import { useBelowMarket, useBelowMarketSide } from '@/features/contractSearch/belowMarketData';
import type { BelowMarketContract } from '@/engine/contracts/belowMarket';
import { BelowMarketResults } from '@/features/contractSearch/BelowMarketResults';
import {
  MAX_SUMMARY_CONTRACTS,
  belowMarketItemLabel,
  rememberBelowMarketSummary,
} from '@/features/contractSearch/belowMarketSummary';
import { loadPublicCourierContracts } from '@/features/contractSearch/publicCourierContracts';
import { useContractSearchRows } from '@/features/contractSearch/useContractSearchRows';
import { useItemsColumns } from '@/features/contractSearch/useItemsColumns';
import { ContractFlagMark } from '@/features/contractSearch/ContractFlagMark';
import { useItemFlagMultiple } from '@/features/contractSearch/contractFlagThreshold';
import { useContractFlagPrices } from '@/features/contractSearch/useContractFlagPrices';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import { useOfferLocations } from '@/features/contractSearch/offerLocations';
import { usePlexPrice } from '@/features/market/plexPrice';
import {
  useCourierEndpoints,
  useListedTypeNames,
  useRegionNames,
} from '@/features/contractSearch/contractSearchNames';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { seedFromOfferRow } from '@/features/industry/planSeed';
import {
  PublicContractDetailModal,
  type PublicContractDetailModalStatChip,
} from '@/features/contracts/PublicContractDetailModal';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { rankedSearch } from '@/lib/rankedSearch';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import {
  CONTRACT_ISK_CENTS_BELOW,
  formatIskAuto,
  formatIskCompact,
  parseIskAmount,
} from '@/lib/isk';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, enumParam, optionalIdParam, textParam } from '@/lib/urlState';
import { DEFAULT_JUMP_RANGE, JUMP_RANGES, type JumpRange } from '@/engine/route/jumpRange';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type CurrentSystemState,
} from '@/features/route/currentSystem';
import {
  CurrentSystemPicker,
  JumpRangeNote,
  JumpRangeSelect,
} from '@/features/route/JumpRangeControls';

const SUGGESTION_LIMIT = 8;

const TYPE_SEARCH_LIMIT = 50;

export type ContractMode = 'items' | 'courier';

const EMPTY_ROWS: readonly PublicContractOfferRow[] = [];
const EMPTY_TYPE_ROWS: readonly { typeId: number }[] = [];
const EMPTY_COURIER_CONTRACT_ROWS: readonly PublicCourierContractRow[] = [];

interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  hideExchanges: boolean;
  hideAuctions: boolean;
  hidePlex: boolean;
  hideOverpriced: boolean;
  jumps: JumpRange;
}

const ITEMS_FILTER_PARAMS = {
  'items.q': textParam(),
  'items.region': optionalIdParam(),
  'items.maxPrice': textParam(),
  'items.minQty': textParam(),
  'items.hideExchanges': boolParam(),
  'items.hideAuctions': boolParam(),
  'items.hidePlex': boolParam(),
  'items.hideOverpriced': boolParam(),
  'items.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'items.type': optionalIdParam(),
  'items.belowMarket': boolParam(),
  'items.bmOther': boolParam(),
};
const ITEMS_SORT = { columnId: 'price', direction: 'asc' } as const;

interface RegionOption {
  id: number;
  name: string;
}

interface ContractSearchFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: RegionOption[];
  currentSystem: CurrentSystemState;
  itemFlagMultiple: number;
  actions?: ReactNode;
  resultCount?: number;
  belowMarket?: {
    side: PriceSide;
    onSideChange: (side: PriceSide) => void;
    includeOther: boolean;
    onIncludeOtherChange: (next: boolean) => void;
  };
}

function activeItemsFilters(
  filter: UiFilter,
  t: TFunction,
  regionOptions: readonly RegionOption[]
): ActiveFilter<UiFilter>[] {
  const active: ActiveFilter<UiFilter>[] = [];
  const { regionId } = filter;
  if (regionId !== null)
    active.push({
      label: t('contractSearch.regionLabel'),
      value: regionOptions.find((option) => option.id === regionId)?.name ?? `#${regionId}`,
      clear: (value) => ({ ...value, regionId: null }),
    });
  if (filter.jumps !== DEFAULT_JUMP_RANGE)
    active.push({
      label: t('jumpRange.label'),
      value: t(`jumpRange.option.${filter.jumps}`),
      clear: (value) => ({ ...value, jumps: DEFAULT_JUMP_RANGE }),
    });
  if (filter.maxPrice.trim() !== '')
    active.push({
      label: t('contractSearch.maxPriceLabel'),
      value: boundText(filter.maxPrice, formatIskCompact, parseIskAmount),
      clear: (value) => ({ ...value, maxPrice: '' }),
    });
  if (filter.minQuantity.trim() !== '')
    active.push({
      label: t('contractSearch.minQuantityLabel'),
      value: boundText(filter.minQuantity, formatCount),
      clear: (value) => ({ ...value, minQuantity: '' }),
    });
  const excluded = [
    filter.hideExchanges && t('contractSearch.hideExchanges'),
    filter.hideAuctions && t('contractSearch.hideAuctions'),
    filter.hidePlex && t('contractSearch.hidePlex'),
  ].filter((name): name is string => typeof name === 'string');
  if (excluded.length > 0)
    active.push({
      label: t('contractSearch.excludeLabel'),
      value: summarizeFilterValues(excluded, t),
      clear: (value) => ({ ...value, hideExchanges: false, hideAuctions: false, hidePlex: false }),
    });
  if (filter.hideOverpriced)
    active.push({
      label: t('contractSearch.priceFlagsLabel'),
      value: t('contractSearch.filterHideOverpriced'),
      clear: (value) => ({ ...value, hideOverpriced: false }),
    });
  return active;
}

function ContractSearchFilterBar({
  filter,
  onChange,
  regionOptions,
  currentSystem,
  itemFlagMultiple,
  actions,
  resultCount,
  belowMarket,
}: ContractSearchFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      active={activeItemsFilters(filter, t, regionOptions)}
      resultCount={resultCount}
      actions={actions}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.typeQuery}
          onChange={(event) => onChange({ ...filter, typeQuery: event.target.value })}
          placeholder={t('contractSearch.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('contractSearch.regionLabel')}>
            <RegionSelect
              options={regionOptions}
              value={draft.regionId}
              onChange={(regionId) => setDraft({ ...draft, regionId })}
              allLabel={t('contractSearch.allRegions')}
              searchPlaceholder={t('common.searchRegions')}
              noResultsLabel={t('common.noRegionMatches')}
              aria-label={t('contractSearch.regionLabel')}
              className="w-48"
            />
          </FilterField>
          <FilterField label={t('contractSearch.maxPriceLabel')}>
            <IskInput
              aria-label={t('contractSearch.maxPriceLabel')}
              placeholder={t('contractSearch.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(maxPrice) => setDraft({ ...draft, maxPrice })}
            />
          </FilterField>
          <FilterField label={t('contractSearch.minQuantityLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.minQuantityLabel')}
              placeholder={t('contractSearch.minQuantityLabel')}
              className="w-28"
              value={draft.minQuantity}
              onChange={(event) => setDraft({ ...draft, minQuantity: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('contractSearch.excludeLabel')}>
            <CheckboxSelect
              label={t('contractSearch.excludeLabel')}
              size="md"
              className="w-44"
              active={draft.hideExchanges || draft.hideAuctions || draft.hidePlex}
              options={[
                { value: 'exchanges' as const, label: t('contractSearch.hideExchanges') },
                { value: 'auctions' as const, label: t('contractSearch.hideAuctions') },
                {
                  value: 'plex' as const,
                  label: t('contractSearch.hidePlex'),
                  description: t('contractSearch.hidePlexTooltip'),
                },
              ]}
              selected={
                new Set([
                  ...(draft.hideExchanges ? (['exchanges'] as const) : []),
                  ...(draft.hideAuctions ? (['auctions'] as const) : []),
                  ...(draft.hidePlex ? (['plex'] as const) : []),
                ])
              }
              onToggle={(value) =>
                setDraft(
                  value === 'exchanges'
                    ? { ...draft, hideExchanges: !draft.hideExchanges }
                    : value === 'auctions'
                      ? { ...draft, hideAuctions: !draft.hideAuctions }
                      : { ...draft, hidePlex: !draft.hidePlex }
                )
              }
            />
          </FilterField>
          <FilterField label={t('contractSearch.priceFlagsLabel')} stretch={false}>
            <FilterChip
              label={t('contractSearch.filterHideOverpriced')}
              size="md"
              tooltip={t('contractSearch.filterHideOverpricedHint', {
                times: itemFlagMultiple,
              })}
              selected={draft.hideOverpriced}
              onToggle={() => setDraft({ ...draft, hideOverpriced: !draft.hideOverpriced })}
            />
          </FilterField>
          <FilterField label={t('jumpRange.label')}>
            <JumpRangeSelect
              value={draft.jumps}
              active={draft.jumps !== DEFAULT_JUMP_RANGE}
              onChange={(jumps) => setDraft({ ...draft, jumps })}
            />
          </FilterField>
          <FilterField label={t('jumpRange.currentSystemLabel')}>
            <CurrentSystemPicker current={currentSystem} />
          </FilterField>
          {belowMarket && (
            <>
              <FilterField label={t('contractSearch.belowMarket.sideLabel')}>
                <Select
                  value={belowMarket.side}
                  onValueChange={(next) => belowMarket.onSideChange(next as PriceSide)}
                >
                  <SelectTrigger
                    aria-label={t('contractSearch.belowMarket.sideLabel')}
                    className="w-36"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sell">{t('contractSearch.belowMarket.sideSell')}</SelectItem>
                    <SelectItem value="buy">{t('contractSearch.belowMarket.sideBuy')}</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField
                label={t('contractSearch.belowMarket.includeOtherLabel')}
                stretch={false}
              >
                <FilterChip
                  label={t('contractSearch.belowMarket.includeOther')}
                  size="md"
                  selected={belowMarket.includeOther}
                  onToggle={() => belowMarket.onIncludeOtherChange(!belowMarket.includeOther)}
                  tooltip={t('contractSearch.belowMarket.includeOtherTooltip')}
                />
              </FilterField>
            </>
          )}
        </>
      )}
    </FilterBar>
  );
}

function SnapshotProgress({ label }: { label: string }) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-1">
      <ProgressBar label={label} value={null} size="xs" className="w-full" />
      <p className="text-[0.6875rem] text-text-dim">{label}</p>
    </div>
  );
}

interface Suggestion extends ContractTypeOption {
  stats: ContractOfferStats;
}

export interface ContractSearchStatus {
  lastSyncedAt: number | null;
  loading: boolean;
  refresh: () => void;
}

interface ContractSearchPanelProps {
  mode: ContractMode;
  onStatusChange?: (status: ContractSearchStatus) => void;
}

export function ContractSearchPanel({ mode, onStatusChange }: ContractSearchPanelProps) {
  const { t } = useTranslation();
  const offers = useRouteSnapshot(loadPublicContractOffers, undefined, {
    cacheKey: 'contractSearchOffers',
    staleWhileRevalidate: true,
  });
  const courier = useRouteSnapshot(loadPublicCourierContracts, undefined, {
    cacheKey: 'contractSearchCourier',
    staleWhileRevalidate: true,
  });
  const { hydrated, activeCharacterId } = offers;

  const offersResult = offers.data?.cached ?? null;
  const courierResult = courier.data?.cached ?? null;
  const courierRows = courierResult?.data?.rows ?? EMPTY_COURIER_CONTRACT_ROWS;

  const [itemsParams, setItemsParams] = useUrlParams(ITEMS_FILTER_PARAMS);
  const uiFilter = useMemo<UiFilter>(
    () => ({
      typeQuery: itemsParams['items.q'],
      regionId: itemsParams['items.region'],
      maxPrice: itemsParams['items.maxPrice'],
      minQuantity: itemsParams['items.minQty'],
      hideExchanges: itemsParams['items.hideExchanges'],
      hideAuctions: itemsParams['items.hideAuctions'],
      hidePlex: itemsParams['items.hidePlex'],
      hideOverpriced: itemsParams['items.hideOverpriced'],
      jumps: itemsParams['items.jumps'],
    }),
    [itemsParams]
  );
  const belowMarket = itemsParams['items.belowMarket'];
  const selectedTypeId = itemsParams['items.type'];
  const searchActive = belowMarket || isItemsSearchActive(uiFilter, selectedTypeId);

  const offerIndex = useOfferIndex(mode === 'items');
  const indexTypeRows = useMemo(
    () =>
      offerIndex ? [...offerIndex.types.keys()].map((typeId) => ({ typeId })) : EMPTY_TYPE_ROWS,
    [offerIndex]
  );
  const nameSource = indexTypeRows;
  const { value: typeNames, resolving: namingTypes } = useListedTypeNames(nameSource);
  const typeOptions = useMemo(
    () => listedContractTypeOptions(nameSource, typeNames),
    [nameSource, typeNames]
  );

  const deferredTypeQuery = useDeferredValue(uiFilter.typeQuery);

  const typeIds = useMemo<ReadonlySet<number> | null>(() => {
    if (selectedTypeId !== null) return new Set([selectedTypeId]);
    if (deferredTypeQuery.trim() === '') return null;
    return new Set(
      rankedSearch(typeOptions, deferredTypeQuery, {
        primary: (option) => option.name,
        limit: TYPE_SEARCH_LIMIT,
      }).map((option) => option.typeId)
    );
  }, [selectedTypeId, deferredTypeQuery, typeOptions]);

  const early = useEarlyOffers(
    offerIndex,
    belowMarket ? null : typeIds,
    mode === 'items' && searchActive
  );
  const rows = early.rows ?? EMPTY_ROWS;
  const typesKnown = offerIndex !== null && !namingTypes;
  const awaitingRows =
    early.rows === null &&
    !early.failed &&
    !(!belowMarket && typesKnown && typeIds !== null && typeIds.size === 0);

  const { value: snapshotEndpoints } = useCourierEndpoints(courierRows);
  const [placedStructures, setPlacedStructures] = useState<ReadonlyMap<number, CourierEndpoint>>(
    () => new Map()
  );
  const placeStructure = useCallback((endpoint: CourierEndpoint) => {
    setPlacedStructures((placed) => new Map(placed).set(endpoint.locationId, endpoint));
  }, []);
  const endpoints = useMemo(
    () =>
      placedStructures.size === 0
        ? snapshotEndpoints
        : new Map([...snapshotEndpoints, ...placedStructures]),
    [snapshotEndpoints, placedStructures]
  );
  const courierRoutes = useMemo(
    () => resolveCourierRoutes(courierRows, endpoints),
    [courierRows, endpoints]
  );
  const regionIds = useMemo(() => {
    const ids = new Set<number>(rows.map((row) => row.regionId));
    for (const id of offerIndex?.regionIds ?? []) ids.add(id);
    for (const route of courierRoutes) {
      if (route.origin.regionId !== null) ids.add(route.origin.regionId);
      if (route.destination.regionId !== null) ids.add(route.destination.regionId);
    }
    return [...ids];
  }, [rows, courierRoutes, offerIndex]);
  const { value: regionNames } = useRegionNames(regionIds);
  const offerLocations = useOfferLocations(rows);
  const hasPlexAsks = useMemo(() => rows.some((row) => row.requestedPlex), [rows]);
  const plexPrice = usePlexPrice(hasPlexAsks);

  const currentSystem = useCurrentSystem();
  const jumpRangeFilter = useJumpRangeFilter(currentSystem, uiFilter.jumps);
  const visibleItemsColumns = useVisibleContractSearchItemsColumns((state) => state.value);
  const setVisibleItemsColumns = useVisibleContractSearchItemsColumns((state) => state.setValue);
  useHydratedStore(useVisibleContractSearchItemsColumns);
  function toggleItemsColumn(id: ContractSearchItemsColumnId) {
    const next = visibleItemsColumns.includes(id)
      ? visibleItemsColumns.filter((existing) => existing !== id)
      : [...visibleItemsColumns, id];
    void setVisibleItemsColumns(next);
  }
  const [selectedRow, setSelectedRow] = useState<PublicContractOfferRow | null>(null);
  const selectedBpcCheck = useMemo(() => {
    if (!selectedRow?.isBlueprintCopy) return undefined;
    const copies = bpcRowsFromContractOffers(rows);
    const subject = copies.find(
      (copy) => copy.contractId === selectedRow.contractId && copy.typeId === selectedRow.typeId
    );
    return subject ? bpcPerRunCheck(subject, copies) : null;
  }, [selectedRow, rows]);

  const activeResult = mode === 'courier' ? courierResult : offersResult;
  const modeRowCount =
    mode === 'courier' ? courierRoutes.length : offerIndex ? offerIndex.types.size : rows.length;
  const active = mode === 'courier' ? courier : offers;
  const modeLoading = active.loading;
  const modeLoadingLabel = t(
    mode === 'courier' ? 'contractSearch.loadingCourier' : 'contractSearch.loadingOffers'
  );
  const modeError = active.error || (mode === 'items' && early.failed === true);
  const revalidating = active.data?.revalidating ?? false;
  const offersRefresh = offers.refresh;
  const courierRefresh = courier.refresh;
  const refresh = useCallback(() => {
    offersRefresh();
    courierRefresh();
  }, [offersRefresh, courierRefresh]);
  const [resultRef, , holdRetryFocus] = useRetryFocus(
    active.loading ? 'busy' : active.error || activeResult === null ? 'failed' : 'ok',
    mode
  );

  const lastSyncedAt = activeResult?.data?.lastSyncedAt ?? null;
  const headerLoading = offers.loading || courier.loading;
  useEffect(() => {
    onStatusChange?.({ lastSyncedAt, loading: headerLoading, refresh });
  }, [onStatusChange, lastSyncedAt, headerLoading, refresh]);

  const regionOptions = useMemo(() => {
    const ids = offerIndex
      ? [...offerIndex.regionIds]
      : [...new Set(rows.map((row) => row.regionId))];
    return ids.map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }));
  }, [rows, offerIndex, regionNames]);

  const { displayRows, statsByType, awaitingQuery } = useContractSearchRows({
    uiFilter,
    rows,
    offerIndex,
    earlyRows: early.rows,
    plexPrice,
    offerLocations,
    allowedSystems: jumpRangeFilter.allowed,
    typeIds,
    belowMarket,
  });

  const itemFlagMultiple = useItemFlagMultiple((state) => state.value);
  useHydratedStore(useItemFlagMultiple);
  const flagPrices = useContractFlagPrices(
    displayRows,
    mode === 'items' && searchActive && !belowMarket
  );
  const flagFor = useCallback(
    (row: PublicContractOfferRow): ContractFlag | null =>
      contractFlagFor(row, { hubSell: flagPrices.sellFor(row), threshold: itemFlagMultiple }),
    [flagPrices, itemFlagMultiple]
  );
  const savingFor = useCallback(
    (row: PublicContractOfferRow): number | null => contractSavingFor(row, flagPrices.sellFor(row)),
    [flagPrices]
  );
  const { shownRows, hiddenOverpriced } = useMemo(() => {
    if (!uiFilter.hideOverpriced) return { shownRows: displayRows, hiddenOverpriced: 0 };
    const { kept, hidden } = splitFlagged(displayRows, flagFor);
    return { shownRows: kept, hiddenOverpriced: hidden.length };
  }, [uiFilter.hideOverpriced, displayRows, flagFor]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (selectedTypeId !== null || uiFilter.typeQuery.trim() === '') return [];
    const ranked = rankedSearch(typeOptions, uiFilter.typeQuery, {
      primary: (option) => option.name,
      limit: SUGGESTION_LIMIT,
    });
    const out: Suggestion[] = [];
    for (const option of ranked) {
      const stats = statsByType.get(option.typeId);
      if (stats) out.push({ ...option, stats });
    }
    return out;
  }, [selectedTypeId, uiFilter.typeQuery, typeOptions, statsByType]);

  const summary = useMemo(
    () => (selectedTypeId === null ? null : contractOfferPriceSummary(shownRows, plexPrice)),
    [selectedTypeId, shownRows, plexPrice]
  );

  const belowMarketSide = useBelowMarketSide((state) => state.value);
  useHydratedStore(useBelowMarketSide);
  const includeOther = itemsParams['items.bmOther'];
  const belowMarketState = useBelowMarket(
    rows,
    mode === 'items' && belowMarket && !awaitingRows,
    plexPrice,
    belowMarketSide,
    includeOther
  );
  const belowMarketRows = useMemo(() => {
    if (belowMarketState.status !== 'ready') return [];
    const passing = new Set(displayRows.map((row) => row.contractId));
    return belowMarketState.contracts.filter((contract) => passing.has(contract.contractId));
  }, [belowMarketState, displayRows]);
  useEffect(() => {
    if (belowMarketState.status !== 'ready' || !belowMarketState.current) return;
    if (namingTypes || lastSyncedAt === null) return;
    const all = belowMarketState.contracts;
    rememberBelowMarketSummary({
      fetchedAt: lastSyncedAt,
      count: all.length,
      contracts: all.slice(0, MAX_SUMMARY_CONTRACTS).map((contract) => ({
        contractId: contract.contractId,
        item: belowMarketItemLabel(contract.lead, typeNames, t),
        more: contract.lines - 1,
        profit: contract.profit,
        systemId: offerLocations.get(contract.lead.locationId)?.systemId ?? null,
      })),
    });
  }, [belowMarketState, namingTypes, lastSyncedAt, typeNames, offerLocations, t]);

  function changeFilter(next: UiFilter) {
    const unpin = selectedTypeId !== null && next.typeQuery !== uiFilter.typeQuery;
    setItemsParams({
      'items.q': next.typeQuery,
      'items.region': next.regionId,
      'items.maxPrice': next.maxPrice,
      'items.minQty': next.minQuantity,
      'items.hideExchanges': next.hideExchanges,
      'items.hideAuctions': next.hideAuctions,
      'items.hidePlex': next.hidePlex,
      'items.hideOverpriced': next.hideOverpriced,
      'items.jumps': next.jumps,
      'items.type': unpin ? null : selectedTypeId,
    });
  }

  function selectType(option: ContractTypeOption) {
    setItemsParams({
      'items.type': option.typeId,
      'items.q': option.name,
    });
  }

  function clearType() {
    setItemsParams({ 'items.type': null, 'items.q': '' });
  }

  function resetFilters() {
    changeFilter({
      typeQuery: '',
      regionId: null,
      maxPrice: '',
      minQuantity: '',
      hideExchanges: false,
      hideAuctions: false,
      hidePlex: false,
      hideOverpriced: false,
      jumps: DEFAULT_JUMP_RANGE,
    });
  }

  const priceFlag = useCallback(
    (row: PublicContractOfferRow) => {
      const flag = flagFor(row);
      return flag && <ContractFlagMark flag={flag} hub={flagPrices.hub} t={t} />;
    },
    [flagFor, flagPrices.hub, t]
  );

  const { columns, itemsColumnsById, itemsCsvColumns, offerJumps, plexAskLabel } = useItemsColumns({
    typeNames,
    regionNames,
    offerLocations,
    jumpRangeFilter,
    plexPrice,
    visibleItemsColumns,
    priceFlag,
    flagFor,
    savingFor,
  });

  const itemsSortProps = useUrlSort(
    'items.sort',
    ITEMS_SORT,
    columns.map((column) => column.id)
  );

  const itemsExport = useTableExport({
    surface: 'contract-search',
    rows: shownRows,
    columns: itemsCsvColumns,
  });

  const statChipsForRow = (row: PublicContractOfferRow): PublicContractDetailModalStatChip[] => {
    const priceLabel = row.requestedPlex
      ? plexPrice === null
        ? plexAskLabel(row)
        : t('contractSearch.priceInclPlex', {
            price: formatIskAuto(offerAskingPrice(row, plexPrice), CONTRACT_ISK_CENTS_BELOW),
            plex: formatCount(row.requestedPlex),
          })
      : row.isAuction
        ? row.buyout !== undefined
          ? t('contractSearch.buyout', {
              price: formatIskAuto(row.buyout, CONTRACT_ISK_CENTS_BELOW),
            })
          : t('contractSearch.startingBid', {
              price: formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW),
            })
        : formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW);
    const chips: PublicContractDetailModalStatChip[] = [
      { label: t('contractSearch.priceColumn'), value: priceLabel },
      { label: t('contractSearch.qtyColumn'), value: formatCount(row.quantity) },
    ];
    if (row.isBlueprintCopy) {
      chips.push(
        { label: t('contractSearch.meTeLabel'), value: `${row.me ?? 0} / ${row.te ?? 0}` },
        { label: t('contractSearch.runsLabel'), value: String(row.runs ?? 0) }
      );
    }
    return chips;
  };

  if (!hydrated || activeCharacterId === null) {
    return <Spinner block="page" label={t('common.loading')} />;
  }

  return (
    <>
      <h2 ref={resultRef} tabIndex={-1} className="sr-only focus:outline-none">
        {t('contractSearch.title')}
      </h2>
      <LiveStatus>
        {!active.loading && (active.error || activeResult === null)
          ? t('common.contractIndexUnreachableTitle')
          : ''}
      </LiveStatus>
      <Panel padded={false} className="max-sm:-mx-2 max-sm:rounded-none max-sm:border-0">
        <>
          {activeResult?.fromCache && (
            <CachedNotice
              className="px-3 pt-2"
              fetchedAt={activeResult.fetchedAt}
              refreshFailed={active.refreshCount > 0}
            />
          )}
          {revalidating && (
            <LiveNote className="px-3 pt-2 text-[0.6875rem] text-text-dim uppercase">
              {t('contractSearch.refreshingInBackground')}
            </LiveNote>
          )}
          {mode === 'courier' && modeLoading && modeRowCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Spinner label={modeLoadingLabel} />
              <p aria-hidden="true" className="text-text-dim">
                {modeLoadingLabel}
              </p>
            </div>
          ) : modeError || (activeResult === null && !modeLoading) ? (
            <LoadFailedState
              title={t('common.contractIndexUnreachableTitle')}
              hint={t('common.contractIndexUnreachableHint')}
              onRetry={() => {
                holdRetryFocus();
                refresh();
              }}
            />
          ) : modeRowCount === 0 && !(mode === 'items' && modeLoading) ? (
            <EmptyState
              title={t(
                mode === 'courier'
                  ? 'contractSearch.courierEmptyTitle'
                  : 'contractSearch.emptyTitle'
              )}
              hint={t(
                mode === 'courier' ? 'contractSearch.courierEmptyHint' : 'contractSearch.emptyHint'
              )}
            />
          ) : mode === 'courier' ? (
            <CourierResults
              rows={courierRoutes}
              regionNames={regionNames}
              characterId={activeCharacterId}
              onStructurePlaced={placeStructure}
            />
          ) : (
            <>
              <ContractSearchFilterBar
                filter={uiFilter}
                onChange={changeFilter}
                regionOptions={regionOptions}
                currentSystem={currentSystem}
                itemFlagMultiple={itemFlagMultiple}
                resultCount={
                  !searchActive || awaitingRows || awaitingQuery
                    ? undefined
                    : belowMarket
                      ? belowMarketState.status === 'ready'
                        ? belowMarketRows.length
                        : undefined
                      : shownRows.length
                }
                belowMarket={
                  belowMarket
                    ? {
                        side: belowMarketSide,
                        onSideChange: (side) => void useBelowMarketSide.getState().setValue(side),
                        includeOther,
                        onIncludeOtherChange: (next) => setItemsParams({ 'items.bmOther': next }),
                      }
                    : undefined
                }
                actions={
                  <>
                    <FilterChip
                      label={t('contractSearch.belowMarket.chip')}
                      size="md"
                      selected={belowMarket}
                      onToggle={() => setItemsParams({ 'items.belowMarket': !belowMarket })}
                      tooltip={t('contractSearch.belowMarket.chipTooltip')}
                    />
                    {!belowMarket && (
                      <>
                        <ColumnPickerMenu
                          available={CONTRACT_SEARCH_ITEMS_COLUMN_IDS}
                          visible={visibleItemsColumns}
                          columnsById={itemsColumnsById}
                          onToggle={toggleItemsColumn}
                          buttonLabel={t('contractSearch.columnsButton')}
                          menuTitle={t('contractSearch.columnsMenuTitle')}
                        />
                        <TableActionsMenu
                          name={t('contractSearch.title')}
                          tableExport={itemsExport}
                          size="md"
                        />
                      </>
                    )}
                  </>
                }
              />

              <div className="px-3 pt-2 text-[0.6875rem] text-text-dim empty:hidden">
                <JumpRangeNote status={jumpRangeFilter.status} />
              </div>

              {hiddenOverpriced > 0 && (
                <LiveNote className="px-3 pt-2 text-[0.6875rem] text-text-dim">
                  {t('contractSearch.overpricedHidden', { count: hiddenOverpriced })}
                </LiveNote>
              )}

              <LiveStatus>
                {suggestions.length > 0 &&
                  t('contractSearch.suggestionsCount', { count: suggestions.length })}
              </LiveStatus>

              {suggestions.length > 0 && (
                <div className="border-b border-line bg-panel-2 px-3 py-2">
                  <p className={cx(eyebrowClassName, 'pb-1.5')}>
                    {t('contractSearch.suggestionsHeading')}
                  </p>
                  <ul
                    aria-label={t('contractSearch.suggestionsLabel')}
                    className="max-h-72 overflow-y-auto rounded-xs border border-line-bright bg-panel"
                  >
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.typeId} className="border-b border-line last:border-b-0">
                        <button
                          type="button"
                          onClick={() => selectType(suggestion)}
                          className={cx(
                            'flex min-h-9 w-full items-center justify-between gap-3 px-3 py-2 text-left',
                            rowInteractiveClassName,
                            focusRingInsetClassName
                          )}
                        >
                          <span className="truncate">{suggestion.name}</span>
                          <span className="shrink-0 text-[0.6875rem] text-text-dim">
                            {t('contractSearch.suggestionOffers', {
                              count: suggestion.stats.offerCount,
                            })}
                            {' · '}
                            {suggestion.stats.cheapest === null
                              ? '—'
                              : formatIskAuto(suggestion.stats.cheapest, CONTRACT_ISK_CENTS_BELOW)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary !== null && !belowMarket && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  <StatChips>
                    <StatChip
                      label={t('contractSearch.offersLabel')}
                      value={formatCount(summary.offerCount)}
                    />
                    <StatChip
                      label={t('contractSearch.cheapestLabel')}
                      value={
                        summary.cheapest === null ? '—' : <IskAmount value={summary.cheapest} />
                      }
                    />
                    <StatChip
                      label={t('contractSearch.medianLabel')}
                      value={summary.median === null ? '—' : <IskAmount value={summary.median} />}
                    />
                  </StatChips>
                  <Button size="sm" onClick={clearType}>
                    {t('contractSearch.clearItem')}
                  </Button>
                </div>
              )}

              {!searchActive ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <EmptyState
                    title={t('contractSearch.searchFirstTitle')}
                    hint={t('contractSearch.searchFirstHint')}
                    className="py-0"
                  />
                  {modeLoading && <SnapshotProgress label={t('contractSearch.downloadStarting')} />}
                </div>
              ) : awaitingRows || awaitingQuery ? (
                <div className="flex flex-col items-center gap-2 py-16">
                  <Spinner label={modeLoadingLabel} />
                  <p aria-hidden="true" className="text-text-dim">
                    {modeLoadingLabel}
                  </p>
                </div>
              ) : belowMarket ? (
                <BelowMarketResults
                  state={belowMarketState}
                  contracts={belowMarketRows}
                  lastSyncedAt={lastSyncedAt}
                  side={belowMarketSide}
                  typeNames={typeNames}
                  offerLocations={offerLocations}
                  offerJumps={offerJumps}
                  onOpen={setSelectedRow}
                  onResetFilters={resetFilters}
                />
              ) : shownRows.length === 0 ? (
                namingTypes && uiFilter.typeQuery.trim() !== '' ? (
                  <Spinner block="panel" label={t('contractSearch.namingTypes')} />
                ) : (
                  <EmptyState
                    title={t('contractSearch.noFilterMatches')}
                    hint={t('contractSearch.noFilterMatchesHint')}
                    className="py-8"
                    action={
                      <Button size="sm" onClick={resetFilters}>
                        {t('common.resetFilters')}
                      </Button>
                    }
                  />
                )
              ) : (
                <>
                  <DataTable
                    {...itemsExport.tableProps}
                    label={t('contractSearch.title')}
                    columns={columns}
                    rows={shownRows}
                    rowKey={(row, index) => `${row.contractId}:${row.typeId}:${index}`}
                    {...itemsSortProps}
                    stackLayout="dense"
                    mobileSort
                    stackSummary={t('contractSearch.mobile.offerCount', {
                      count: shownRows.length,
                    })}
                    onRowClick={setSelectedRow}
                    rowMoreActions
                    rowContextMenu={(row, tr) => (
                      <BuildPlanContextMenu
                        typeId={row.typeId}
                        itemName={typeNames.get(row.typeId)}
                        seed={seedFromOfferRow(row)}
                        extraItems={<OpenInEveMenuItem kind="contract" id={row.contractId} />}
                        trigger={tr}
                      />
                    )}
                    virtualize
                  />
                </>
              )}
            </>
          )}
        </>
      </Panel>
      {selectedRow && activeCharacterId !== null && (
        <PublicContractDetailModal
          title={typeNames.get(selectedRow.typeId) ?? `#${selectedRow.typeId}`}
          characterId={activeCharacterId}
          contractId={selectedRow.contractId}
          locationId={selectedRow.locationId}
          system={(() => {
            const loc = offerLocations.get(selectedRow.locationId);
            return loc?.systemId != null && loc.systemName !== null
              ? { id: loc.systemId, name: loc.systemName }
              : null;
          })()}
          regionName={regionNames.get(selectedRow.regionId) ?? `#${selectedRow.regionId}`}
          dateExpired={selectedRow.dateExpired}
          statChips={statChipsForRow(selectedRow)}
          askingIsk={
            selectedRow.requestsItems || isUnpricedOffer(selectedRow, plexPrice)
              ? null
              : offerAskingPrice(selectedRow, plexPrice)
          }
          searchedTypeIds={typeIds}
          bpcCheck={selectedBpcCheck}
          flag={flagFor(selectedRow)}
          flagMultiple={itemFlagMultiple}
          {...(belowMarket && belowMarketState.status === 'ready'
            ? {
                defaultPriceSide: belowMarketState.side,
                otherValue: otherValueOf(belowMarketState.contracts, selectedRow.contractId),
              }
            : {})}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </>
  );
}

function otherValueOf(contracts: readonly BelowMarketContract[], contractId: number) {
  const contract = contracts.find((c) => c.contractId === contractId);
  return contract && contract.other > 0
    ? { value: contract.other, lines: contract.otherLines }
    : null;
}
