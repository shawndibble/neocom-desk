/**
 * The Contracts page's Item search and Courier tabs (issue #908): search every public
 * item_exchange/auction contract line in the shared Public Contract Offers
 * snapshot, any item type.
 *
 * A sibling of `features/bpcContracts/BpcSourcingPanel.tsx`, not a
 * generalization of it. That panel merges the character's own blueprints into
 * its results and filters on ME/TE/runs; this one is public-contract data
 * only (the ticket's explicit non-goal) and those dimensions mean nothing to
 * a stack of Tritanium. What the two genuinely share — the region lookup, the
 * ranked type search, the asking-price rule — is imported, not copied.
 *
 * It shows one of two corpora at a time (issue #910): Items, the offers above,
 * and Courier, the public courier contracts of `publicCourierContracts`. Modes
 * rather than one merged result set because a haul has no item, quantity or
 * price and an offer has no route, reward or collateral — see
 * `CourierResults.tsx` and #910's scope decision. This component owns what
 * both need: the two snapshots, the region names, and which mode is showing.
 *
 * Mounts under a Router: every item row is a Build Plan context-menu
 * trigger (#931), and so is each line of the detail modal's contents.
 */
import type { PriceSide } from '@/engine/miningTax/priceBasis';
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CheckboxSelect,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  LoadFailedState,
  FilterBar,
  countActive,
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
  LiveStatus,
  CachedNotice,
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
  type ContractSaleKind,
  type ContractTypeOption,
} from '@/engine/contracts/contractSearch';
import {
  bpcRowsFromContractOffers,
  type PublicContractOfferRow,
} from '@/engine/contracts/contractOffers';
import { bpcPerRunCheck } from '@/engine/contracts/bpcPerRunCheck';
import { contractFlagFor, splitFlagged, type ContractFlag } from '@/engine/contracts/contractFlags';
import {
  resolveCourierRoutes,
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
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  boolParam,
  enumParam,
  optionalEnumParam,
  optionalIdParam,
  textParam,
} from '@/lib/urlState';
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

/** How many candidate types the suggestion list offers at once. */
const SUGGESTION_LIMIT = 8;

/**
 * How many types a free-text query (one the user never resolved to a single
 * suggestion) widens to. Higher than `SUGGESTION_LIMIT` on purpose: typing
 * "tritanium" and not clicking anything should still show every Tritanium-ish
 * listing, not only the eight the dropdown had room for.
 */
const TYPE_SEARCH_LIMIT = 50;

const SALE_KINDS: ContractSaleKind[] = ['exchange', 'auction'];

/** Which corpus is showing — the route's Item search or Courier tab. Items is the landing mode. */
export type ContractMode = 'items' | 'courier';

/** Stable identities: the name hooks key their effects on these references. */
const EMPTY_ROWS: readonly PublicContractOfferRow[] = [];
const EMPTY_TYPE_ROWS: readonly { typeId: number }[] = [];
const EMPTY_COURIER_CONTRACT_ROWS: readonly PublicCourierContractRow[] = [];

/** The filter as the controls hold it: text fields stay strings until they are parsed into the engine's filter. */
interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  saleKind: ContractSaleKind | null;
  hideAuctions: boolean;
  /** Hides a contract asking for PLEX in return (`requestedPlex`). */
  hidePlex: boolean;
  /**
   * Hides the contracts the board flags as priced far above the hub (#4773).
   * Judged on the rows after the engine's filter, since it needs hub prices.
   */
  hideOverpriced: boolean;
  /** Distance from the Current System (`engine/route/jumpRange.ts`); `'any'` is no restriction. */
  jumps: JumpRange;
}

/** The Items board's own filter, selection and show-all, in the URL (ADR 0015) as one group. */
const ITEMS_FILTER_PARAMS = {
  'items.q': textParam(),
  'items.region': optionalIdParam(),
  'items.maxPrice': textParam(),
  'items.minQty': textParam(),
  'items.kind': optionalEnumParam(SALE_KINDS),
  'items.hideAuctions': boolParam(),
  'items.hidePlex': boolParam(),
  'items.hideOverpriced': boolParam(),
  'items.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'items.type': optionalIdParam(),
  /** Below market (#3989): one row per contract, valued at the hub. */
  'items.belowMarket': boolParam(),
  /** Below market: also list contracts valued only through other contracts' asks (#5427). */
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
  /** The Jump Range filter's origin — computed above this bar since `FilterBar` unmounts its children. */
  currentSystem: CurrentSystemState;
  /** The pilot's flag multiple, named in the Hide overpriced tooltip. */
  itemFlagMultiple: number;
  /** The table's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
  /** Below market on: its two valuation controls join the filters. They write their own settings at once, not into the draft. */
  belowMarket?: {
    side: PriceSide;
    onSideChange: (side: PriceSide) => void;
    includeOther: boolean;
    onIncludeOtherChange: (next: boolean) => void;
  };
}

function ContractSearchFilterBar({
  filter,
  onChange,
  regionOptions,
  currentSystem,
  itemFlagMultiple,
  actions,
  belowMarket,
}: ContractSearchFilterBarProps) {
  const { t } = useTranslation();
  // Counted off the controls, not off the parsed engine filter: a half-typed
  // "1e" parses to `null` there, and the badge should say the field has been
  // touched rather than silently drop back to zero mid-keystroke.
  const activeCount = countActive([
    filter.typeQuery,
    filter.regionId !== null,
    filter.maxPrice,
    filter.minQuantity,
    filter.saleKind !== null,
    filter.hideAuctions,
    filter.hidePlex,
    filter.hideOverpriced,
    filter.jumps !== DEFAULT_JUMP_RANGE,
  ]);

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
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
          <div
            role="group"
            aria-label={t('contractSearch.saleKindLabel')}
            className="flex flex-wrap gap-2"
          >
            {SALE_KINDS.map((kind) => (
              <FilterChip
                key={kind}
                label={t(`contractSearch.saleKind.${kind}`)}
                size="md"
                selected={draft.saleKind === kind}
                onToggle={() =>
                  setDraft({ ...draft, saleKind: draft.saleKind === kind ? null : kind })
                }
              />
            ))}
          </div>
          <FilterField label={t('contractSearch.excludeLabel')}>
            <CheckboxSelect
              label={t('contractSearch.excludeLabel')}
              size="md"
              className="w-44"
              options={[
                { value: 'auctions' as const, label: t('contractSearch.hideAuctions') },
                {
                  value: 'plex' as const,
                  label: t('contractSearch.hidePlex'),
                  description: t('contractSearch.hidePlexTooltip'),
                },
              ]}
              selected={
                new Set([
                  ...(draft.hideAuctions ? (['auctions'] as const) : []),
                  ...(draft.hidePlex ? (['plex'] as const) : []),
                ])
              }
              onToggle={(value) =>
                setDraft(
                  value === 'auctions'
                    ? { ...draft, hideAuctions: !draft.hideAuctions }
                    : { ...draft, hidePlex: !draft.hidePlex }
                )
              }
            />
          </FilterField>
          {/* A filter, not a view control: it sits in the funnel as Market Browser's Hide bait sells does. */}
          <FilterChip
            label={t('contractSearch.filterHideOverpriced')}
            size="md"
            tooltip={t('contractSearch.filterHideOverpricedHint', {
              times: itemFlagMultiple,
            })}
            selected={draft.hideOverpriced}
            onToggle={() => setDraft({ ...draft, hideOverpriced: !draft.hideOverpriced })}
          />
          <FilterField label={t('jumpRange.label')}>
            <JumpRangeSelect
              value={draft.jumps}
              onChange={(jumps) => setDraft({ ...draft, jumps })}
            />
          </FilterField>
          {/* Writes its own setting straight away — not part of this draft, see `currentSystem.ts`. */}
          <CurrentSystemPicker current={currentSystem} />
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
              <FilterChip
                label={t('contractSearch.belowMarket.includeOther')}
                size="md"
                selected={belowMarket.includeOther}
                onToggle={() => belowMarket.onIncludeOtherChange(!belowMarket.includeOther)}
                tooltip={t('contractSearch.belowMarket.includeOtherTooltip')}
              />
            </>
          )}
        </>
      )}
    </FilterBar>
  );
}

/** A thin, out-of-the-way indeterminate bar while the R2 offer index loads. */
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

/**
 * What the page header needs to draw this panel's freshness badge and Refresh
 * button (issue-less UI move): the age of the snapshot *currently on screen*,
 * which is per mode, plus the reload both corpora share.
 *
 * Reported upward rather than lifted: the two `useRouteSnapshot` calls below
 * cannot move into `Contracts.tsx` without also running on the History tab,
 * where neither public snapshot is wanted — hooks can't be conditional, and
 * the hook has no "skip" flag.
 */
export interface ContractSearchStatus {
  /** ms since epoch of the snapshot behind the visible board, or null while nothing has landed. */
  lastSyncedAt: number | null;
  /** Either corpus is in flight — the shared Refresh acts on both. */
  loading: boolean;
  /** Stable identity: both underlying `refresh`es are `useCallback([])`. */
  refresh: () => void;
}

interface ContractSearchPanelProps {
  /** Which corpus is showing — the route's own tab (`CONTRACTS_TABS`), owned there. */
  mode: ContractMode;
  /**
   * Called whenever the freshness/refresh state changes. The page header owns
   * the badge and the Refresh button; this panel owns the data behind them.
   */
  onStatusChange?: (status: ContractSearchStatus) => void;
}

/** Search every public item_exchange/auction contract line, any item type. Read-only, cached for offline. */
export function ContractSearchPanel({ mode, onStatusChange }: ContractSearchPanelProps) {
  const { t } = useTranslation();
  /**
   * One hook per corpus, so neither board waits on the other's snapshot. The
   * two used to arrive together out of a single loader, on the argument that
   * the courier snapshot is one small read against the offers snapshot's ~124
   * chunk docs (as it then was) — which is true, and is exactly why pairing them was the wrong trade:
   * a hauler opening Courier waited on ~370k item-offer rows to be shown ~620
   * hauls (issue #963).
   *
   * `staleWhileRevalidate` keeps the rows on screen across a manual Refresh,
   * which matters more now that a Refresh no longer blanks both boards at once.
   */
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
      saleKind: itemsParams['items.kind'],
      hideAuctions: itemsParams['items.hideAuctions'],
      hidePlex: itemsParams['items.hidePlex'],
      hideOverpriced: itemsParams['items.hideOverpriced'],
      jumps: itemsParams['items.jumps'],
    }),
    [itemsParams]
  );
  const belowMarket = itemsParams['items.belowMarket'];
  /** The type the user picked out of the suggestion list, pinning the search to exactly one item. */
  const selectedTypeId = itemsParams['items.type'];
  /**
   * Search-first (issue #2921): with nothing to search for the Items board
   * asks for a search instead of rendering ~370k offers, while the snapshot
   * keeps downloading behind it so the first search usually finds it landed.
   */
  // Below market needs no search: it is already a narrowing of the snapshot.
  const searchActive = belowMarket || isItemsSearchActive(uiFilter, selectedTypeId);

  // R2 is index-only (issue #4270): names, suggestions and the region list
  // come off the index, and the table off the rows read for a search's types.
  const offerIndex = useOfferIndex(mode === 'items');
  const indexTypeRows = useMemo(
    () =>
      offerIndex ? [...offerIndex.types.keys()].map((typeId) => ({ typeId })) : EMPTY_TYPE_ROWS,
    [offerIndex]
  );
  const nameSource = indexTypeRows;
  // Names fill in behind whichever table is showing — see
  // `contractSearchNames.ts`. None of them gate a board: every consumer
  // already renders an unresolved id honestly.
  const { value: typeNames, resolving: namingTypes } = useListedTypeNames(nameSource);
  const typeOptions = useMemo(
    () => listedContractTypeOptions(nameSource, typeNames),
    [nameSource, typeNames]
  );

  /**
   * Deferred rather than the raw keystroke value: `typeIds` feeding
   * `displayRows` below re-filters and re-sorts up to ~370k rows, and running
   * that synchronously on every keystroke is what made a click elsewhere in
   * the app stall while this panel was open (issue #2024). `uiFilter.typeQuery`
   * itself stays undeferred — the search box and the (cheap, small-set)
   * suggestion list must still track every keystroke immediately.
   */
  const deferredTypeQuery = useDeferredValue(uiFilter.typeQuery);

  /**
   * A pinned type wins outright. Otherwise a non-blank query widens to the
   * types it ranks against; `null` means "no type restriction", which is not
   * the same as the empty set a query matching nothing produces.
   */
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

  // Below market reads every type whatever the search: a contract's other
  // lines and the comparable offers behind a copy's value are of other types.
  const early = useEarlyOffers(
    offerIndex,
    belowMarket ? null : typeIds,
    mode === 'items' && searchActive
  );
  const rows = early.rows ?? EMPTY_ROWS;
  /**
   * A search with nothing to show yet: no per-type read has answered. A query that matched no listed type needs no
   * rows at all, so it is not waiting on any.
   */
  // "Matched nothing" is only knowable once every listed type has a name to
  // rank against: with no index yet (loading, unpublished, rules not deployed)
  // or names still resolving, an empty set means "not known", not "no match".
  const typesKnown = offerIndex !== null && !namingTypes;
  const awaitingRows =
    early.rows === null &&
    !early.failed &&
    // Below market reads every type, so a query matching none still awaits rows.
    !(!belowMarket && typesKnown && typeIds !== null && typeIds.size === 0);

  const { value: endpoints } = useCourierEndpoints(courierRows);
  // Synchronous, so the haul list never empties while its ends are being
  // placed: an unresolved end shows its raw location id, exactly as a player
  // structure does once resolution has finished.
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
  // Over the whole snapshot, not the filtered rows: keyed on the distinct
  // location ids, so narrowing the filter never changes the key and never
  // flashes the newly shown rows back to "resolving".
  const offerLocations = useOfferLocations(rows);
  // Converts a contract's PLEX ask into ISK so it prices, sorts and filters
  // like any other — until it lands, a PLEX-asking row reads as unpriced.
  const hasPlexAsks = useMemo(() => rows.some((row) => row.requestedPlex), [rows]);
  const plexPrice = usePlexPrice(hasPlexAsks);

  // Computed here rather than inside `ContractSearchFilterBar`: `FilterBar`
  // unmounts its children whenever the funnel collapses, and both the origin
  // and the distances behind it (`features/route/currentSystem.ts`) must
  // survive that.
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
  // A blueprint copy has no market price, so an opened one is held per run
  // against the other copies of the same blueprint, as BPC Sourcing does.
  // Absent for anything that is not a copy. The rows are those read for the
  // search, so a contract that bundles other types looks single-type here: its
  // price is then divided by one blueprint's runs. That can only raise a rate,
  // so the cheapest is safe, and the median shrugs off the odd bundle.
  const selectedBpcCheck = useMemo(() => {
    if (!selectedRow?.isBlueprintCopy) return undefined;
    const copies = bpcRowsFromContractOffers(rows);
    const subject = copies.find(
      (copy) => copy.contractId === selectedRow.contractId && copy.typeId === selectedRow.typeId
    );
    return subject ? bpcPerRunCheck(subject, copies) : null;
  }, [selectedRow, rows]);

  // Freshness and the offline banner both name the snapshot actually on
  // screen: the two are published by the same job but cached separately, so a
  // courier read served from Dexie under a live offers read is a real state.
  const activeResult = mode === 'courier' ? courierResult : offersResult;
  // Items rows stay empty until a search names types (R2 is index-only), so the
  // listed types stand in for them: an index with types is data, not "nothing
  // synced" — that would hide the filter bar and the search box.
  const modeRowCount =
    mode === 'courier' ? courierRoutes.length : offerIndex ? offerIndex.types.size : rows.length;
  const active = mode === 'courier' ? courier : offers;
  /**
   * Per mode, and against that mode's own data: the board on screen spins only
   * while *it* has nothing, never because the other corpus is still arriving,
   * and never because a name lookup behind it has not answered.
   */
  const modeLoading = active.loading;
  const modeLoadingLabel = t(
    mode === 'courier' ? 'contractSearch.loadingCourier' : 'contractSearch.loadingOffers'
  );
  // A failed per-type R2 read is an error too: an empty table would claim
  // nothing matched.
  const modeError = active.error || (mode === 'items' && early.failed === true);
  /** Last cycle's rows are on screen and this cycle's are on the way (#963). */
  const revalidating = active.data?.revalidating ?? false;
  // A manual Refresh still means "reload the tab", not "reload the mode I am
  // looking at" — the Data Age badge and offline banner are per corpus, but the
  // button above them is one button.
  const offersRefresh = offers.refresh;
  const courierRefresh = courier.refresh;
  const refresh = useCallback(() => {
    offersRefresh();
    courierRefresh();
  }, [offersRefresh, courierRefresh]);
  // Retry can unmount into the spinner: focus waits on the always-mounted wrapper.
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
    // Every region with an offer, which the index states before any chunk has
    // landed; a few early rows would otherwise offer only their own regions.
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

  // Row flags (#4773): hub prices for what is on screen, judged by the pure
  // engine. Silent until a type is priced, so a slow price read never flags
  // wrongly, and off while Below market replaces the table.
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
      // No offers left once the other filters apply: offering it would be a
      // suggestion that lands on an empty table.
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
  /**
   * The bar's filters at contract grain: every field but quantity and type is
   * the contract's own, so a contract passes when any of its lines does —
   * which is also how a search names a contract by one of its items.
   */
  const belowMarketRows = useMemo(() => {
    if (belowMarketState.status !== 'ready') return [];
    const passing = new Set(displayRows.map((row) => row.contractId));
    return belowMarketState.contracts.filter((contract) => passing.has(contract.contractId));
  }, [belowMarketState, displayRows]);
  // What the Overview's Below-market widget reads, so it never prices the snapshot itself.
  useEffect(() => {
    // Only once these contracts are the current rows', so the age stored is theirs.
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
    // Typing anything other than the pinned type's own name un-pins it —
    // otherwise editing the box would leave a search that no longer says what
    // it is filtering on. Grouped into one write with the filter fields
    // themselves, since two `useUrlParams` writes in the same tick would drop
    // one of them.
    const unpin = selectedTypeId !== null && next.typeQuery !== uiFilter.typeQuery;
    setItemsParams({
      'items.q': next.typeQuery,
      'items.region': next.regionId,
      'items.maxPrice': next.maxPrice,
      'items.minQty': next.minQuantity,
      'items.kind': next.saleKind,
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
      saleKind: null,
      hideAuctions: false,
      hidePlex: false,
      hideOverpriced: false,
      jumps: DEFAULT_JUMP_RANGE,
    });
  }

  // Stable, so the column set is not rebuilt on every panel render.
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

  /**
   * Same price rule the table's own column already renders (starting bid vs.
   * buyout), spelled out as a full sentence for the modal header rather than
   * the column's compact suffix.
   */
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
    // ME/TE/runs are blueprint-only columns, absent on a plain item line.
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
        {/* Only what the visible branch below says. */}
        {!active.loading && (active.error || activeResult === null)
          ? t('common.contractIndexUnreachableTitle')
          : ''}
      </LiveStatus>
      <Panel
        padded={false}
        // Frameless on a phone, bleeding through `<main>`'s `px-2`: the dense
        // list is the page there, and a border plus gutter on each side costs
        // a 390px screen the width the card's two lines need.
        className="max-sm:-mx-2 max-sm:rounded-none max-sm:border-0"
        // No title or header strip: the route's tab immediately above already
        // reads "Item search" or "Courier", and the freshness badge and
        // Refresh sit on the page header. The table keeps its own accessible
        // name from `contractSearch.title`.
      >
        <>
          {activeResult?.fromCache && (
            // A Refresh that still falls back to cache is a more alarming
            // case than the first load finding cache — same banner, different
            // copy. It is also how a background revalidation that failed
            // reaches the screen: `esi/cache.ts` re-serves the stored row
            // with `fromCache` set once the late call reports a failure, so
            // a refresh that never lands is stated rather than left standing
            // as a loading state.
            <CachedNotice
              className="px-3 pt-2"
              fetchedAt={activeResult.fetchedAt}
              refreshFailed={active.refreshCount > 0}
            />
          )}
          {revalidating && (
            // The visible half of stale-serve: these rows are last publish
            // cycle's and this cycle's are already on the way. Said beside
            // the Data Age badge's own reading, not instead of it — the badge
            // says how old, this says something is being done about it.
            <p role="status" className="px-3 pt-2 text-[0.6875rem] text-text-dim uppercase">
              {t('contractSearch.refreshingInBackground')}
            </p>
          )}
          {mode === 'courier' && modeLoading && modeRowCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Spinner label={modeLoadingLabel} />
              {/* Visible copy of the spinner's own label — the first sync is
                    slow enough that a bare arc reads as stuck. Hidden from
                    assistive tech, which already hears the status. */}
              <p aria-hidden="true" className="text-text-dim">
                {modeLoadingLabel}
              </p>
            </div>
          ) : modeError || (activeResult === null && !modeLoading) ? (
            // The read failed, or came back with nothing: the live index was
            // unreachable and nothing is cached. That is not "no contracts
            // synced yet".
            <LoadFailedState
              title={t('common.contractIndexUnreachableTitle')}
              hint={t('common.contractIndexUnreachableHint')}
              onRetry={() => {
                holdRetryFocus();
                refresh();
              }}
            />
          ) : modeRowCount === 0 && !(mode === 'items' && modeLoading) ? (
            // Nothing synced for the corpus on screen — distinct from
            // `noFilterMatches` below, which is "rows exist, the filter just
            // excludes them all". Per mode, so an empty courier snapshot never
            // claims the offers never synced either.
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
            />
          ) : (
            <>
              <ContractSearchFilterBar
                filter={uiFilter}
                onChange={changeFilter}
                regionOptions={regionOptions}
                currentSystem={currentSystem}
                itemFlagMultiple={itemFlagMultiple}
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
                    {/* A view control, not a filter: it changes the rows and columns at once (§4b). */}
                    <FilterChip
                      label={t('contractSearch.belowMarket.chip')}
                      size="md"
                      selected={belowMarket}
                      onToggle={() => setItemsParams({ 'items.belowMarket': !belowMarket })}
                      tooltip={t('contractSearch.belowMarket.chipTooltip')}
                    />
                    {/* Both act on the offer table, which Below market replaces. */}
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

              {/*
                  Outside the bar, not inside its `children`: the funnel box
                  unmounts those the moment the funnel closes, and a range set
                  from a pasted link must still explain itself with the
                  sheet/row shut. `JumpRangeNote` itself renders nothing once
                  it has an origin, so this costs no DOM the rest of the time.
                */}
              <div className="px-3 pt-2 text-[0.6875rem] text-text-dim empty:hidden">
                <JumpRangeNote status={jumpRangeFilter.status} />
              </div>

              {hiddenOverpriced > 0 && (
                // Said, not silent: Hide overpriced never makes the board's rows quietly shorter (§6c).
                <p role="status" className="px-3 pt-2 text-[0.6875rem] text-text-dim">
                  {t('contractSearch.overpricedHidden', { count: hiddenOverpriced })}
                </p>
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
                  // Every type still reads `#34` until the market catalogue
                  // lands, so a typed query matches nothing yet. "No matches"
                  // would be a complete answer given mid-load; this says what
                  // is actually true.
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
                    // Index included deliberately: one contract lists the same
                    // item once per stack, so contractId+typeId is not unique —
                    // the duplicate React keys left stale rows in the table.
                    rowKey={(row, index) => `${row.contractId}:${row.typeId}:${index}`}
                    {...itemsSortProps}
                    // Two-line cards on a phone: a buyer scans hundreds of
                    // offers for a price and a place, not reads each one.
                    stackLayout="dense"
                    mobileSort
                    stackSummary={t('contractSearch.mobile.offerCount', {
                      count: shownRows.length,
                    })}
                    onRowClick={setSelectedRow}
                    rowMoreActions
                    // The shortcut past the detail modal, which offers the
                    // same action per line since #933 — hence the shared
                    // `planSeed` rule, so neither path quotes the copy
                    // differently.
                    rowContextMenu={(row, tr) => (
                      <BuildPlanContextMenu
                        typeId={row.typeId}
                        itemName={typeNames.get(row.typeId)}
                        seed={seedFromOfferRow(row)}
                        extraItems={<OpenInEveMenuItem kind="contract" id={row.contractId} />}
                        trigger={tr}
                      />
                    )}
                    // A busy region's snapshot runs to thousands of offers;
                    // every one stays reachable without mounting them all.
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
          // The ISK the contract costs, for the price check. A barter, a PLEX ask
          // with no PLEX price yet, or an ask for items has no honest ISK figure.
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

/** The board's estimate from other contracts for the contract the slide-over opened on, when it has one. */
function otherValueOf(contracts: readonly BelowMarketContract[], contractId: number) {
  const contract = contracts.find((c) => c.contractId === contractId);
  return contract && contract.other > 0
    ? { value: contract.other, lines: contract.otherLines }
    : null;
}
