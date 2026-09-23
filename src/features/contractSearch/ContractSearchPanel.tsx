/**
 * The Contracts page's Search tab (issue #908): search every public
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  RegionSelect,
  SearchInput,
  Spinner,
  StatChip,
  TextInput,
  IskAmount,
  type DataTableColumn,
} from '@/components/ui';
import {
  contractOfferPriceSummary,
  contractOfferStats,
  filterContractOffers,
  isUnpricedOffer,
  listedContractTypeOptions,
  offerAskingPrice,
  type ContractOfferFilter,
  type ContractOfferStats,
  type ContractSaleKind,
  type ContractTypeOption,
} from '@/engine/contracts/contractSearch';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  resolveCourierRoutes,
  type PublicCourierContractRow,
} from '@/engine/contracts/courierSearch';
import { loadPublicContractOffers } from '@/features/contractSearch/publicContractOffers';
import { loadPublicCourierContracts } from '@/features/contractSearch/publicCourierContracts';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import { useOfferLocations } from '@/features/contractSearch/offerLocations';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  useCourierEndpoints,
  useListedTypeNames,
  useRegionNames,
} from '@/features/contractSearch/contractSearchNames';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { seedFromOfferRow } from '@/features/industry/planSeed';
import {
  PublicContractDetailModal,
  type PublicContractDetailModalStatChip,
} from '@/features/contracts/PublicContractDetailModal';
import { isSyncConfigured } from '@/app/syncStatus';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { rankedSearch } from '@/lib/rankedSearch';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import { cx } from '@/lib/cx';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  boolParam,
  enumParam,
  optionalEnumParam,
  optionalIdParam,
  textParam,
} from '@/lib/urlState';
import {
  DEFAULT_JUMP_RANGE,
  JUMP_RANGES,
  withinJumpRange,
  type JumpRange,
} from '@/engine/route/jumpRange';
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

/** Rows shown before "show all" — the same cap the character-contracts table and BPC Search use. */
const ROW_CAP = 50;

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

/** Which corpus the tab is showing. Items is the landing mode — it is what the tab was before #910. */
const CONTRACT_MODES = ['items', 'courier'] as const;
export type ContractMode = (typeof CONTRACT_MODES)[number];

/**
 * Guarded so a build with no sync backend reads nothing at all — not even the
 * cache. `chunkedSnapshot.ts` refuses the Firestore call on its own, so this is
 * belt and braces rather than the only check; what it buys is that an
 * unconfigured build does no work on the way to saying so.
 */
const NO_SNAPSHOT = { cached: null, revalidating: false } as const;

const loadOffers = async (characterId: number) =>
  isSyncConfigured() ? loadPublicContractOffers(characterId) : NO_SNAPSHOT;

const loadCourier = async (characterId: number) =>
  isSyncConfigured() ? loadPublicCourierContracts(characterId) : NO_SNAPSHOT;

/** Stable identities: the name hooks key their effects on these references. */
const EMPTY_ROWS: readonly PublicContractOfferRow[] = [];
const EMPTY_COURIER_CONTRACT_ROWS: readonly PublicCourierContractRow[] = [];

/** The filter as the controls hold it: text fields stay strings until they are parsed into the engine's filter. */
interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  saleKind: ContractSaleKind | null;
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
  'items.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'items.type': optionalIdParam(),
  'items.all': boolParam(),
};
const ITEMS_SORT = { columnId: 'price', direction: 'asc' } as const;

/** A blank or unparseable field is "no restriction", never `NaN` — which would silently exclude every row. */
function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `offerAskingPrice`, except an unpriced (barter) row sorts last rather than
 * at its literal 0 (issue #1080) — used only for the fixed, ascending
 * "cheapest first" default view below (`displayRows`), a plain array
 * `.sort()` this `Infinity` sentinel is safe for. `DataTable`'s own
 * reversible column sort must not use this: `sortValueForPriceColumn` below
 * returns `undefined` for that instead, since `Infinity` would sort
 * *first* the moment a pilot clicks the Price header to flip it to
 * descending — the exact bug this fix removes, reintroduced from the
 * other direction.
 */
function sortablePrice(row: PublicContractOfferRow): number {
  return isUnpricedOffer(row) ? Infinity : offerAskingPrice(row);
}

/**
 * The Price column's own `sortValue` — `undefined`, not `Infinity`, for an
 * unpriced row: `DataTable.sortRows` appends every `undefined` row after
 * the sorted, valued ones regardless of sort direction, the same
 * "unknowable sorts last either way" rule `BpcSourcingPanel.tsx`'s ISK/run
 * column already follows for its own `undefined`.
 */
function sortValueForPriceColumn(row: PublicContractOfferRow): number | undefined {
  return isUnpricedOffer(row) ? undefined : offerAskingPrice(row);
}

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
}

function ContractSearchFilterBar({
  filter,
  onChange,
  regionOptions,
  currentSystem,
}: ContractSearchFilterBarProps) {
  const { t } = useTranslation();
  // Counted off the controls, not off the parsed engine filter: a half-typed
  // "1e" parses to `null` there, and the badge should say the field has been
  // touched rather than silently drop back to zero mid-keystroke.
  const activeCount = [
    filter.typeQuery,
    filter.regionId !== null,
    filter.maxPrice,
    filter.minQuantity,
    filter.saleKind !== null,
    filter.jumps !== DEFAULT_JUMP_RANGE,
  ].filter(Boolean).length;

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
      // Region, max price, min quantity, sale kind, Jump Range and Current
      // System: six controls beside the search box wrap to two rows above
      // the table they exist to narrow — the same call the Courier bar makes.
      collapsible
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
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.maxPriceLabel')}
              placeholder={t('contractSearch.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
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
                selected={draft.saleKind === kind}
                onToggle={() =>
                  setDraft({ ...draft, saleKind: draft.saleKind === kind ? null : kind })
                }
              />
            ))}
          </div>
          <FilterField label={t('jumpRange.label')}>
            <JumpRangeSelect
              value={draft.jumps}
              onChange={(jumps) => setDraft({ ...draft, jumps })}
            />
          </FilterField>
          {/* Writes its own setting straight away — not part of this draft, see `currentSystem.ts`. */}
          <CurrentSystemPicker current={currentSystem} />
        </>
      )}
    </FilterBar>
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
  /** Which corpus is showing — a path segment on the route (`CONTRACTS_TABS`), owned there. */
  mode: ContractMode;
  onModeChange: (mode: ContractMode) => void;
  /**
   * Called whenever the freshness/refresh state changes. The page header owns
   * the badge and the Refresh button; this panel owns the data behind them.
   */
  onStatusChange?: (status: ContractSearchStatus) => void;
  /**
   * Phone only: an element in the route's tab row the Items/Courier switch is
   * portalled into, so the Search/History tabs and the corpus switch share
   * one line instead of stacking a tab bar over a panel header holding two
   * chips — two rows of chrome above a list that is the whole point of the
   * page. Ignored at `sm` and up, and when absent the switch falls back to the
   * panel header, so the panel still works alone.
   */
  modeSwitchSlot?: HTMLElement | null;
}

interface ContractModeSegmentsProps {
  mode: ContractMode;
  onChange: (mode: ContractMode) => void;
}

/**
 * The phone's Items/Courier switch: the same two pressed/unpressed toggles as
 * the desktop chips (`aria-pressed`, exactly one on, same accessible names),
 * drawn as one joined control. Beside a tab bar, two free-standing chips read
 * as two more filters; a shared border reads as one either/or choice. Each
 * segment is `min-h-11` — the touch tier — since it sits where a thumb lands.
 */
function ContractModeSegments({ mode, onChange }: ContractModeSegmentsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('contractSearch.modeLabel')}
      className="inline-flex overflow-hidden rounded-xs border border-line"
    >
      {CONTRACT_MODES.map((candidate, index) => {
        const selected = mode === candidate;
        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(candidate)}
            className={cx(
              'inline-flex min-h-11 items-center px-3 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
              index > 0 && 'border-l border-line',
              selected ? 'bg-accent/15 text-accent' : 'text-text-dim hover:text-text'
            )}
          >
            {t(`contractSearch.mode.${candidate}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Search every public item_exchange/auction contract line, any item type. Read-only, cached for offline. */
export function ContractSearchPanel({
  mode,
  onModeChange,
  onStatusChange,
  modeSwitchSlot,
}: ContractSearchPanelProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const isPhone = useIsPhone();
  /**
   * One hook per corpus, so neither board waits on the other's snapshot. The
   * two used to arrive together out of a single loader, on the argument that
   * the courier snapshot is one small chunk doc against the offers snapshot's
   * ~124 — which is true, and is exactly why pairing them was the wrong trade:
   * a hauler opening Courier waited on ~370k item-offer rows to be shown ~620
   * hauls (issue #963).
   *
   * `staleWhileRevalidate` keeps the rows on screen across a manual Refresh,
   * which matters more now that a Refresh no longer blanks both boards at once.
   */
  const offers = useRouteSnapshot(loadOffers, undefined, {
    cacheKey: 'contractSearchOffers',
    staleWhileRevalidate: true,
  });
  const courier = useRouteSnapshot(loadCourier, undefined, {
    cacheKey: 'contractSearchCourier',
    staleWhileRevalidate: true,
  });
  const { hydrated, activeCharacterId } = offers;

  const offersResult = offers.data?.cached ?? null;
  const courierResult = courier.data?.cached ?? null;
  const rows = offersResult?.data?.rows ?? EMPTY_ROWS;
  const courierRows = courierResult?.data?.rows ?? EMPTY_COURIER_CONTRACT_ROWS;

  // A pure read of the build's own env, so it needs no loader to report it —
  // this distinguishes "this build has no sync backend at all" from "synced,
  // and empty", which is what the two boards' own empty states say.
  const syncConfigured = isSyncConfigured();

  // Names fill in behind whichever table is showing — see
  // `contractSearchNames.ts`. None of them gate a board: every consumer
  // already renders an unresolved id honestly.
  const { value: typeNames, resolving: namingTypes } = useListedTypeNames(rows);
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
    for (const route of courierRoutes) {
      if (route.origin.regionId !== null) ids.add(route.origin.regionId);
      if (route.destination.regionId !== null) ids.add(route.destination.regionId);
    }
    return [...ids];
  }, [rows, courierRoutes]);
  const { value: regionNames } = useRegionNames(regionIds);
  // Over the whole snapshot, not the filtered rows: keyed on the distinct
  // location ids, so narrowing the filter never changes the key and never
  // flashes the newly shown rows back to "resolving".
  const offerLocations = useOfferLocations(rows);

  const [itemsParams, setItemsParams] = useUrlParams(ITEMS_FILTER_PARAMS);
  const uiFilter = useMemo<UiFilter>(
    () => ({
      typeQuery: itemsParams['items.q'],
      regionId: itemsParams['items.region'],
      maxPrice: itemsParams['items.maxPrice'],
      minQuantity: itemsParams['items.minQty'],
      saleKind: itemsParams['items.kind'],
      jumps: itemsParams['items.jumps'],
    }),
    [itemsParams]
  );
  // Computed here rather than inside `ContractSearchFilterBar`: `FilterBar`
  // unmounts its children whenever the funnel collapses, and both the origin
  // and the distances behind it (`features/route/currentSystem.ts`) must
  // survive that.
  const currentSystem = useCurrentSystem();
  const jumpRangeFilter = useJumpRangeFilter(currentSystem, uiFilter.jumps);
  /** The type the user picked out of the suggestion list, pinning the search to exactly one item. */
  const selectedTypeId = itemsParams['items.type'];
  const showAll = itemsParams['items.all'];
  const setShowAll = useCallback(
    (value: boolean) => setItemsParams({ 'items.all': value }),
    [setItemsParams]
  );
  const [selectedRow, setSelectedRow] = useState<PublicContractOfferRow | null>(null);

  // Freshness and the offline banner both name the snapshot actually on
  // screen: the two are published by the same job but cached separately, so a
  // courier read served from Dexie under a live offers read is a real state.
  const activeResult = mode === 'courier' ? courierResult : offersResult;
  const modeRowCount = mode === 'courier' ? courierRoutes.length : rows.length;
  const active = mode === 'courier' ? courier : offers;
  /**
   * Per mode, and against that mode's own data: the board on screen spins only
   * while *it* has nothing, never because the other corpus is still arriving,
   * and never because a name lookup behind it has not answered.
   */
  const modeLoading = active.loading;
  const modeError = active.error;
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

  const lastSyncedAt = activeResult?.data?.lastSyncedAt ?? null;
  const headerLoading = offers.loading || courier.loading;
  useEffect(() => {
    onStatusChange?.({ lastSyncedAt, loading: headerLoading, refresh });
  }, [onStatusChange, lastSyncedAt, headerLoading, refresh]);

  const typeOptions = useMemo(() => listedContractTypeOptions(rows, typeNames), [rows, typeNames]);

  const regionOptions = useMemo(() => {
    const ids = [...new Set(rows.map((row) => row.regionId))];
    return ids.map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }));
  }, [rows, regionNames]);

  /**
   * Everything except the item type. Split out so a keystroke in the search
   * box re-runs only the cheap type narrowing below rather than a fresh pass
   * over the whole snapshot — and so the suggestion list's counts are
   * computed against the same region/price/kind restrictions the results
   * are, which is what stops a suggestion reading "40 offers" from landing on
   * a table of two.
   */
  const nonTypeFilter = useMemo<ContractOfferFilter>(
    () => ({
      regionId: uiFilter.regionId,
      maxPrice: parseNumeric(uiFilter.maxPrice),
      minQuantity: parseNumeric(uiFilter.minQuantity),
      saleKind: uiFilter.saleKind,
    }),
    [uiFilter.regionId, uiFilter.maxPrice, uiFilter.minQuantity, uiFilter.saleKind]
  );
  /**
   * Jump Range folded in here rather than into `nonTypeFilter`/the engine:
   * only this layer resolves an offer's system (`useOfferLocations`), so
   * `filterContractOffers` cannot see it. A row this app has *placed* and
   * cannot connect to the origin — a player structure, or a system the
   * stargate graph does not reach — drops out the moment a range is active:
   * "within 5 jumps" is a claim an unknown distance cannot back.
   *
   * A row still *resolving* (no entry in `offerLocations` yet) is a
   * different case and stays. `useOfferLocations` can still be working
   * through the snapshot's ids while the distances have already landed, and
   * dropping an unresolved row here would read as "nothing in range" for an
   * answer that has simply not arrived yet — the same "only a finished
   * answer excludes" rule Courier's `narrowToOverRate` follows for its own
   * mid-load rows.
   */
  const nonTypeRows = useMemo(() => {
    const engineFiltered = filterContractOffers(rows, nonTypeFilter);
    const allowed = jumpRangeFilter.allowed;
    if (allowed === null) return engineFiltered;
    return engineFiltered.filter((row) => {
      const location = offerLocations.get(row.locationId);
      return location === undefined || withinJumpRange(location.systemId, allowed);
    });
  }, [rows, nonTypeFilter, offerLocations, jumpRangeFilter.allowed]);
  const statsByType = useMemo(() => contractOfferStats(nonTypeRows), [nonTypeRows]);

  /**
   * A pinned type wins outright. Otherwise a non-blank query widens to the
   * types it ranks against; `null` means "no type restriction", which is not
   * the same as the empty set a query matching nothing produces.
   */
  const typeIds = useMemo<ReadonlySet<number> | null>(() => {
    if (selectedTypeId !== null) return new Set([selectedTypeId]);
    if (uiFilter.typeQuery.trim() === '') return null;
    return new Set(
      rankedSearch(typeOptions, uiFilter.typeQuery, {
        primary: (option) => option.name,
        limit: TYPE_SEARCH_LIMIT,
      }).map((option) => option.typeId)
    );
  }, [selectedTypeId, uiFilter.typeQuery, typeOptions]);

  /**
   * Cheapest first *before* the row cap, not after it. `DataTable` sorts only
   * the rows it is handed, so capping the snapshot's own contract-then-type
   * order would leave the table claiming a price-ascending sort over an
   * arbitrary 50 — and the Cheapest chip naming a price no visible row
   * carries. Sorting first makes the capped view honestly "the 50 cheapest
   * offers"; Show all lifts it.
   *
   * An unpriced (barter) row sorts last regardless of its raw price (issue
   * #1080): its 0 ISK is not a real price, and sorting on it as one would
   * put the row asking for goods at the very top of the default view — the
   * harm this fix exists to remove.
   */
  const displayRows = useMemo(
    () =>
      filterContractOffers(nonTypeRows, { typeIds }).sort(
        (a, b) => sortablePrice(a) - sortablePrice(b)
      ),
    [nonTypeRows, typeIds]
  );

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
    () => (selectedTypeId === null ? null : contractOfferPriceSummary(displayRows)),
    [selectedTypeId, displayRows]
  );

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
      'items.jumps': next.jumps,
      'items.type': unpin ? null : selectedTypeId,
      'items.all': false,
    });
  }

  function selectType(option: ContractTypeOption) {
    setItemsParams({
      'items.type': option.typeId,
      'items.q': option.name,
      'items.all': false,
    });
  }

  function clearType() {
    setItemsParams({ 'items.type': null, 'items.q': '', 'items.all': false });
  }

  const columns = useMemo<DataTableColumn<PublicContractOfferRow>[]>(
    () => [
      {
        id: 'item',
        header: t('contractSearch.itemColumn'),
        primary: true,
        sortValue: (row) => typeNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => typeNames.get(row.typeId) ?? `#${row.typeId}`,
      },
      {
        id: 'qty',
        header: t('contractSearch.qtyColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        render: (row) => row.quantity.toLocaleString(),
        // The dense phone card has no header row, and a bare "12" beside a
        // system name says nothing about what it counts.
        stackAffix: { before: t('contractSearch.mobile.qtyAffix') },
      },
      {
        id: 'price',
        header: t('contractSearch.priceColumn'),
        align: 'right',
        // The headline figure of the dense phone card, on the title line.
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => sortValueForPriceColumn(row),
        render: (row) => (
          <>
            {/* Long press, not tap: the row's own tap opens the offer's detail modal. */}
            <IskAmount value={offerAskingPrice(row)} revealOn="longPress" />
            {row.isAuction && (
              // An auction's number is a starting bid unless the seller set a
              // buyout, so the figure alone would read as a fixed ask.
              <span className="ml-1 text-[0.6875rem] text-text-dim uppercase">
                {row.buyout
                  ? t('contractSearch.buyoutShort')
                  : t('contractSearch.startingBidShort')}
              </span>
            )}
            {isUnpricedOffer(row) && (
              // A barter's 0 ISK is real but not a price (issue #1080) — the
              // row's own tap already opens the detail modal, which shows
              // both sides of the exchange correctly.
              <span className="block text-[0.625rem] text-text-dim">
                {t('contractSearch.unpricedOfferMarker')}
              </span>
            )}
          </>
        ),
      },
      {
        // The system, with its security, is what a buyer actually weighs —
        // whether the pickup is a hop from home or a trip into lowsec — and a
        // region alone cannot say either. After Price so the phone card's
        // meta line reads "Qty · System · Region · Exp", narrowest place last.
        id: 'system',
        header: t('contractSearch.systemColumn'),
        className: 'whitespace-nowrap',
        // Unplaced or still resolving sinks in either direction, rather than
        // sorting as a name — the Price column's "unknowable sorts last" rule.
        sortValue: (row) => offerLocations.get(row.locationId)?.systemName ?? undefined,
        render: (row) => {
          const location = offerLocations.get(row.locationId);
          // Missing key: the local lookup has not answered yet. Distinct from
          // a null name, which is a finished answer — a player structure, or
          // a table that could not be read — and must not read as pending.
          if (location === undefined) return <span className="text-text-dim">…</span>;
          if (location.systemName === null) return <span className="text-text-dim">—</span>;
          return (
            <>
              {location.systemName}
              {location.security !== null && (
                <>
                  {' '}
                  <SecurityStatus security={location.security} />
                </>
              )}
            </>
          );
        },
      },
      {
        id: 'region',
        header: t('contractSearch.regionColumn'),
        sortValue: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
        render: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
      },
      {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
        stackAffix: { before: t('contractSearch.mobile.expiresAffix') },
      },
    ],
    [t, typeNames, regionNames, offerLocations, timeZone]
  );
  const itemsSortProps = useUrlSort(
    'items.sort',
    ITEMS_SORT,
    columns.map((column) => column.id)
  );

  const visibleRows = showAll ? displayRows : displayRows.slice(0, ROW_CAP);

  /**
   * Same price rule the table's own column already renders (starting bid vs.
   * buyout), spelled out as a full sentence for the modal header rather than
   * the column's compact suffix.
   */
  const statChipsForRow = (row: PublicContractOfferRow): PublicContractDetailModalStatChip[] => {
    const priceLabel = row.isAuction
      ? row.buyout !== undefined
        ? t('contractSearch.buyout', { price: formatIskAuto(row.buyout, CONTRACT_ISK_CENTS_BELOW) })
        : t('contractSearch.startingBid', {
            price: formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW),
          })
      : formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW);
    const chips: PublicContractDetailModalStatChip[] = [
      { label: t('contractSearch.priceColumn'), value: priceLabel },
      { label: t('contractSearch.qtyColumn'), value: row.quantity.toLocaleString() },
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
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  // Exactly one switch per render, chosen here rather than by CSS: two copies
  // with one hidden would still be two buttons named "Courier". The panel
  // mounts a render before the route's slot ref lands, so the header copy
  // shows first and the portal takes over on the next pass.
  const portalSwitch = syncConfigured && isPhone && modeSwitchSlot != null;

  return (
    <>
      {portalSwitch &&
        createPortal(<ContractModeSegments mode={mode} onChange={onModeChange} />, modeSwitchSlot)}
      <Panel
        padded={false}
        // Frameless on a phone, bleeding through `<main>`'s `px-2`: the dense
        // list is the page there, and a border plus gutter on each side costs
        // a 390px screen the width the card's two lines need. The switch that
        // held the header strip has moved up into the tab row (see
        // `modeSwitchSlot`), so the strip goes with it.
        className="max-sm:-mx-2 max-sm:rounded-none max-sm:border-0"
        // No title of its own: the tab immediately above already reads
        // "Search", and repeating it in the panel header beneath reads as a
        // stutter. The table keeps its own accessible name from
        // `contractSearch.title`.
        //
        // The corpus switch takes the header strip the freshness badge and
        // Refresh used to hold — those now sit on the page header beside the
        // route title, the way every other route draws them, and this strip
        // would otherwise be a hairline holding nothing while the chips kept a
        // whole rule of vertical space to themselves.
        //
        // Chips rather than a second `Tabs` bar: the page's own tab strip sits
        // immediately above this panel, and stacking a full-width tablist under
        // it reads as the same stutter the panel drops its title to avoid.
        // Exactly one is always on — picking the active chip again leaves it on
        // rather than clearing to no corpus at all. Gone entirely when the
        // build has no sync backend: there is nothing to switch between, and
        // dropping it takes the empty header with it.
        meta={
          syncConfigured &&
          !portalSwitch && (
            <div
              role="group"
              aria-label={t('contractSearch.modeLabel')}
              className="flex flex-wrap gap-2"
            >
              {CONTRACT_MODES.map((candidate) => (
                <FilterChip
                  key={candidate}
                  label={t(`contractSearch.mode.${candidate}`)}
                  selected={mode === candidate}
                  onToggle={() => onModeChange(candidate)}
                />
              ))}
            </div>
          )
        }
      >
        {!syncConfigured ? (
          <EmptyState
            title={t('contractSearch.notConfiguredTitle')}
            hint={t('contractSearch.notConfiguredHint')}
          />
        ) : (
          <>
            {activeResult?.fromCache && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {/*
                  A Refresh that still falls back to cache is a more alarming
                  case than the first load finding cache — same banner, different
                  copy. It is also how a background revalidation that failed
                  reaches the screen: `esi/cache.ts` re-serves the stored row
                  with `fromCache` set once the late call reports a failure, so
                  a refresh that never lands is stated rather than left standing
                  as a loading state.
                */}
                {active.refreshCount > 0
                  ? t('common.refreshFailedTitle')
                  : t('common.offlineTitle')}
              </p>
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
            {modeLoading && modeRowCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16">
                <Spinner
                  label={t(
                    mode === 'courier'
                      ? 'contractSearch.loadingCourier'
                      : 'contractSearch.loadingOffers'
                  )}
                />
              </div>
            ) : modeError ? (
              <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
            ) : modeRowCount === 0 ? (
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
                  mode === 'courier'
                    ? 'contractSearch.courierEmptyHint'
                    : 'contractSearch.emptyHint'
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
                />

                {/*
                  Outside the bar, not inside its `children`: `collapsible`
                  unmounts those the moment the funnel closes, and a range set
                  from a pasted link must still explain itself with the
                  sheet/row shut. `JumpRangeNote` itself renders nothing once
                  it has an origin, so this costs no DOM the rest of the time.
                */}
                <div className="px-3 pt-2 text-[0.6875rem] text-text-dim empty:hidden">
                  <JumpRangeNote status={jumpRangeFilter.status} />
                </div>

                {suggestions.length > 0 && (
                  <div className="border-b border-line bg-panel-2 px-3 py-2">
                    <p className="pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                      {t('contractSearch.suggestionsHeading')}
                    </p>
                    <ul
                      aria-label={t('contractSearch.suggestionsLabel')}
                      className="max-h-72 overflow-y-auto rounded-xs border border-line-bright bg-panel"
                    >
                      {suggestions.map((suggestion) => (
                        <li
                          key={suggestion.typeId}
                          className="border-b border-line last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => selectType(suggestion)}
                            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:min-h-9"
                          >
                            <span className="truncate">{suggestion.name}</span>
                            <span className="shrink-0 text-[0.6875rem] text-text-dim">
                              {t('contractSearch.suggestionOffers', {
                                count: suggestion.stats.offerCount,
                              })}
                              {' · '}
                              {suggestion.stats.cheapest === null
                                ? '—'
                                : formatIskAuto(
                                    suggestion.stats.cheapest,
                                    CONTRACT_ISK_CENTS_BELOW
                                  )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary !== null && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                    <StatChip
                      label={t('contractSearch.offersLabel')}
                      value={summary.offerCount.toLocaleString()}
                    />
                    <StatChip
                      label={t('contractSearch.cheapestLabel')}
                      value={
                        summary.cheapest === null ? (
                          '—'
                        ) : (
                          <IskAmount value={summary.cheapest} revealOn="tap" />
                        )
                      }
                    />
                    <StatChip
                      label={t('contractSearch.medianLabel')}
                      value={
                        summary.median === null ? (
                          '—'
                        ) : (
                          <IskAmount value={summary.median} revealOn="tap" />
                        )
                      }
                    />
                    <Button size="sm" onClick={clearType}>
                      {t('contractSearch.clearItem')}
                    </Button>
                  </div>
                )}

                {displayRows.length === 0 ? (
                  namingTypes && uiFilter.typeQuery.trim() !== '' ? (
                    // Every type still reads `#34` until the market catalogue
                    // lands, so a typed query matches nothing yet. "No matches"
                    // would be a complete answer given mid-load; this says what
                    // is actually true.
                    <div className="flex justify-center py-8">
                      <Spinner label={t('contractSearch.namingTypes')} />
                    </div>
                  ) : (
                    <EmptyState
                      title={t('contractSearch.noFilterMatches')}
                      hint={t('contractSearch.noFilterMatchesHint')}
                      className="py-8"
                    />
                  )
                ) : (
                  <>
                    <DataTable
                      label={t('contractSearch.title')}
                      columns={columns}
                      rows={visibleRows}
                      // Index included deliberately: one contract lists the same
                      // item once per stack, so contractId+typeId is not unique —
                      // the duplicate React keys left stale rows in the table.
                      rowKey={(row, index) => `${row.contractId}:${row.typeId}:${index}`}
                      {...itemsSortProps}
                      // Two-line cards on a phone: a buyer scans hundreds of
                      // offers for a price and a place, not reads each one.
                      stackLayout="dense"
                      mobileSort
                      // Counted over every matching offer, not the capped 50
                      // on screen — the Show all button below says the same
                      // total, and the two must not disagree.
                      stackSummary={t('contractSearch.mobile.offerCount', {
                        count: displayRows.length,
                      })}
                      onRowClick={setSelectedRow}
                      // The shortcut past the detail modal, which offers the
                      // same action per line since #933 — hence the shared
                      // `planSeed` rule, so neither path quotes the copy
                      // differently.
                      rowContextMenu={(row, tr) => (
                        <BuildPlanContextMenu
                          typeId={row.typeId}
                          itemName={typeNames.get(row.typeId)}
                          seed={seedFromOfferRow(row)}
                          trigger={tr}
                        />
                      )}
                    />
                    {!showAll && displayRows.length > ROW_CAP && (
                      <div className="px-3 py-2">
                        <Button size="sm" onClick={() => setShowAll(true)}>
                          {t('contractSearch.showAll', { count: displayRows.length })}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </Panel>
      {selectedRow && activeCharacterId !== null && (
        <PublicContractDetailModal
          title={typeNames.get(selectedRow.typeId) ?? `#${selectedRow.typeId}`}
          characterId={activeCharacterId}
          contractId={selectedRow.contractId}
          locationId={selectedRow.locationId}
          regionName={regionNames.get(selectedRow.regionId) ?? `#${selectedRow.regionId}`}
          dateExpired={selectedRow.dateExpired}
          statChips={statChipsForRow(selectedRow)}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </>
  );
}
