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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SearchInput,
  Spinner,
  StatChip,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  contractOfferPriceSummary,
  contractOfferStats,
  filterContractOffers,
  listedContractTypeOptions,
  offerAskingPrice,
  type ContractOfferFilter,
  type ContractOfferStats,
  type ContractSaleKind,
  type ContractTypeOption,
} from '@/engine/contracts/contractSearch';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import {
  loadPublicContractOffers,
  type PublicContractOffersSnapshot,
} from '@/features/contractSearch/publicContractOffers';
import {
  loadPublicCourierContracts,
  type PublicCourierContractsSnapshot,
} from '@/features/contractSearch/publicCourierContracts';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import {
  useCourierRoutes,
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
import type { CachedResult } from '@/esi/cache';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { rankedSearch } from '@/lib/rankedSearch';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

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

/** `Select` has no null value, so "no region chosen" needs a sentinel option. */
const ALL_REGIONS = 'all';

const SALE_KINDS: ContractSaleKind[] = ['exchange', 'auction'];

/** Which corpus the tab is showing. Items is the landing mode — it is what the tab was before #910. */
const CONTRACT_MODES = ['items', 'courier'] as const;
type ContractMode = (typeof CONTRACT_MODES)[number];

const EMPTY_ROWS: readonly PublicContractOfferRow[] = [];
/** Stable identity: the routes hook keys its effect on this array's reference. */
const EMPTY_COURIER_CONTRACT_ROWS: readonly PublicCourierContractRow[] = [];
const NO_REGIONS: number[] = [];

/**
 * One corpus, on its own. The two used to arrive together out of a single
 * loader, on the argument that the courier snapshot is one small chunk doc
 * against the offers snapshot's ~124 — which is true, and is exactly why
 * pairing them was the wrong trade: a hauler opening Courier waited on ~370k
 * item-offer rows to be shown ~620 hauls (issue #963). Fetched separately,
 * each board renders the moment its own snapshot lands, and the cheap one is
 * no longer held behind the expensive one.
 *
 * `syncConfigured` rides along rather than being read at render: it is the
 * difference between "synced, and empty" and "this build has no sync backend
 * at all", and only the loader is in a position to say which.
 */
interface CorpusSnapshot<TSnapshot> {
  result: CachedResult<TSnapshot> | null;
  syncConfigured: boolean;
}

const NOT_CONFIGURED = { result: null, syncConfigured: false } as const;

async function loadOffersCorpus(
  characterId: number
): Promise<CorpusSnapshot<PublicContractOffersSnapshot>> {
  if (!isSyncConfigured()) return NOT_CONFIGURED;
  return { result: await loadPublicContractOffers(characterId), syncConfigured: true };
}

async function loadCourierCorpus(
  characterId: number
): Promise<CorpusSnapshot<PublicCourierContractsSnapshot>> {
  if (!isSyncConfigured()) return NOT_CONFIGURED;
  return { result: await loadPublicCourierContracts(characterId), syncConfigured: true };
}

/** The filter as the controls hold it: text fields stay strings until they are parsed into the engine's filter. */
interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  saleKind: ContractSaleKind | null;
}

const EMPTY_UI_FILTER: UiFilter = {
  typeQuery: '',
  regionId: null,
  maxPrice: '',
  minQuantity: '',
  saleKind: null,
};

/** A blank or unparseable field is "no restriction", never `NaN` — which would silently exclude every row. */
function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface RegionOption {
  id: number;
  name: string;
}

interface ContractSearchFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: RegionOption[];
}

function ContractSearchFilterBar({
  filter,
  onChange,
  regionOptions,
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
  ].filter(Boolean).length;

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
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
            <Select
              value={draft.regionId === null ? ALL_REGIONS : String(draft.regionId)}
              onValueChange={(value) =>
                setDraft({ ...draft, regionId: value === ALL_REGIONS ? null : Number(value) })
              }
            >
              <SelectTrigger aria-label={t('contractSearch.regionLabel')} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>{t('contractSearch.allRegions')}</SelectItem>
                {regionOptions.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </>
      )}
    </FilterBar>
  );
}

interface Suggestion extends ContractTypeOption {
  stats: ContractOfferStats;
}

/** Search every public item_exchange/auction contract line, any item type. Read-only, cached for offline. */
export function ContractSearchPanel() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  // One hook per corpus, so neither board waits on the other's snapshot.
  // `staleWhileRevalidate` keeps the rows on screen across a manual Refresh,
  // which matters more now that a Refresh no longer blanks both boards at once.
  const offers = useRouteSnapshot(loadOffersCorpus, undefined, {
    cacheKey: 'contractSearchOffers',
    staleWhileRevalidate: true,
  });
  const courier = useRouteSnapshot(loadCourierCorpus, undefined, {
    cacheKey: 'contractSearchCourier',
    staleWhileRevalidate: true,
  });
  const { hydrated, activeCharacterId } = offers;

  const offersResult = offers.data?.result ?? null;
  const courierResult = courier.data?.result ?? null;
  const rows = offersResult?.data?.rows ?? EMPTY_ROWS;
  const courierRows = courierResult?.data?.rows ?? undefined;

  // Both loaders answer the same question, so either having loaded settles it;
  // `true` while both are still in flight keeps the not-configured empty state
  // from flashing on a configured build.
  const syncConfigured =
    (offers.data?.syncConfigured ?? true) && (courier.data?.syncConfigured ?? true);

  // Names fill in behind whichever table is showing — see
  // `contractSearchNames.ts`. None of them gate a board: every consumer
  // already renders an unresolved id honestly.
  const { value: typeNames } = useListedTypeNames(rows);
  const { value: courierRoutes, resolving: placingRoutes } = useCourierRoutes(
    courierRows ?? EMPTY_COURIER_CONTRACT_ROWS
  );
  const regionIds = useMemo(() => {
    if (rows === EMPTY_ROWS && courierRoutes.length === 0) return NO_REGIONS;
    const ids = new Set<number>(rows.map((row) => row.regionId));
    for (const route of courierRoutes) {
      if (route.origin.regionId !== null) ids.add(route.origin.regionId);
      if (route.destination.regionId !== null) ids.add(route.destination.regionId);
    }
    return [...ids];
  }, [rows, courierRoutes]);
  const { value: regionNames, resolving: namingRegions } = useRegionNames(regionIds);

  const [uiFilter, setUiFilter] = useState<UiFilter>(EMPTY_UI_FILTER);
  /** The type the user picked out of the suggestion list, pinning the search to exactly one item. */
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<ContractMode>('items');
  const [selectedRow, setSelectedRow] = useState<PublicContractOfferRow | null>(null);

  // Freshness and the offline banner both name the snapshot actually on
  // screen: the two are published by the same job but cached separately, so a
  // courier read served from Dexie under a live offers read is a real state.
  const activeResult = mode === 'courier' ? courierResult : offersResult;
  const modeRowCount = mode === 'courier' ? courierRoutes.length : rows.length;
  const active = mode === 'courier' ? courier : offers;
  /**
   * Per mode, and against that mode's own data: the board on screen spins only
   * while *it* has nothing, never because the other corpus is still arriving.
   * Courier additionally waits on its endpoints, since `courierRoutes` is what
   * the count below is taken from.
   */
  const modeLoading =
    mode === 'courier'
      ? courier.loading || placingRoutes || courierRows === undefined
      : offers.loading;
  const modeError = active.error;
  // A manual Refresh still means "reload the tab", not "reload the mode I am
  // looking at" — the Data Age badge and offline banner are per corpus, but the
  // button above them is one button.
  const refresh = () => {
    offers.refresh();
    courier.refresh();
  };

  const typeOptions = useMemo(() => listedContractTypeOptions(rows, typeNames), [rows, typeNames]);

  const regionOptions = useMemo(() => {
    const ids = [...new Set(rows.map((row) => row.regionId))];
    return ids
      .map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
  const nonTypeRows = useMemo(
    () => filterContractOffers(rows, nonTypeFilter),
    [rows, nonTypeFilter]
  );
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
   */
  const displayRows = useMemo(
    () =>
      filterContractOffers(nonTypeRows, { typeIds }).sort(
        (a, b) => offerAskingPrice(a) - offerAskingPrice(b)
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
    // it is filtering on.
    if (selectedTypeId !== null && next.typeQuery !== uiFilter.typeQuery) setSelectedTypeId(null);
    setUiFilter(next);
    setShowAll(false);
  }

  function selectType(option: ContractTypeOption) {
    setSelectedTypeId(option.typeId);
    setUiFilter((previous) => ({ ...previous, typeQuery: option.name }));
    setShowAll(false);
  }

  function clearType() {
    setSelectedTypeId(null);
    setUiFilter((previous) => ({ ...previous, typeQuery: '' }));
    setShowAll(false);
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
      },
      {
        id: 'price',
        header: t('contractSearch.priceColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => offerAskingPrice(row),
        render: (row) => (
          <>
            {formatIsk(offerAskingPrice(row), 2)}
            {row.isAuction && (
              // An auction's number is a starting bid unless the seller set a
              // buyout, so the figure alone would read as a fixed ask.
              <span className="ml-1 text-[0.6875rem] text-text-dim uppercase">
                {row.buyout
                  ? t('contractSearch.buyoutShort')
                  : t('contractSearch.startingBidShort')}
              </span>
            )}
          </>
        ),
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
      },
    ],
    [t, typeNames, regionNames, timeZone]
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
        ? t('contractSearch.buyout', { price: formatIsk(row.buyout, 2) })
        : t('contractSearch.startingBid', { price: formatIsk(row.price, 2) })
      : formatIsk(row.price, 2);
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

  return (
    <>
      <Panel
        padded={false}
        // No title of its own: the tab immediately above already reads
        // "Search", and repeating it in the panel header beneath reads as a
        // stutter. The table keeps its own accessible name from
        // `contractSearch.title`.
        meta={
          activeResult?.data?.lastSyncedAt && (
            <DataAgeBadge date={new Date(activeResult.data.lastSyncedAt)} />
          )
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('contractSearch.refresh')}
            onClick={refresh}
            disabled={offers.loading || courier.loading}
          />
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
            {/*
            Chips rather than a second `Tabs` bar: the page's own tab strip sits
            immediately above this panel, and stacking a full-width tablist
            under it reads as the same stutter the panel drops its title to
            avoid. Exactly one is always on — picking the active chip again
            leaves it on rather than clearing to no corpus at all.
          */}
            <div
              role="group"
              aria-label={t('contractSearch.modeLabel')}
              className="flex flex-wrap gap-2 border-b border-line px-3 py-2"
            >
              {CONTRACT_MODES.map((candidate) => (
                <FilterChip
                  key={candidate}
                  label={t(`contractSearch.mode.${candidate}`)}
                  selected={mode === candidate}
                  onToggle={() => setMode(candidate)}
                />
              ))}
            </div>
            {namingRegions && modeRowCount > 0 && (
              // The only name stage with real network cost: one ESI call per
              // distinct region on a cold cache. Said quietly, under the board
              // rather than over it, because the rows are already readable —
              // the Region column shows `#10000002` until this lands.
              <p role="status" className="px-3 pt-2 text-[0.6875rem] text-text-dim uppercase">
                {t('contractSearch.namingRegions')}
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
              <CourierResults rows={courierRoutes} regionNames={regionNames} />
            ) : (
              <>
                <ContractSearchFilterBar
                  filter={uiFilter}
                  onChange={changeFilter}
                  regionOptions={regionOptions}
                />

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
                              {formatIsk(suggestion.stats.cheapest, 2)}
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
                      value={summary.cheapest === null ? '—' : formatIsk(summary.cheapest, 2)}
                    />
                    <StatChip
                      label={t('contractSearch.medianLabel')}
                      value={summary.median === null ? '—' : formatIsk(summary.median, 2)}
                    />
                    <Button size="sm" onClick={clearType}>
                      {t('contractSearch.clearItem')}
                    </Button>
                  </div>
                )}

                {displayRows.length === 0 ? (
                  <EmptyState
                    title={t('contractSearch.noFilterMatches')}
                    hint={t('contractSearch.noFilterMatchesHint')}
                    className="py-8"
                  />
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
                      defaultSort={{ columnId: 'price', direction: 'asc' }}
                      onRowClick={setSelectedRow}
                      // The shortcut past the detail modal, which offers the
                      // same action per line since #933 — hence the shared
                      // `planSeed` rule, so neither path quotes the copy
                      // differently.
                      rowContextMenu={(row, tr) => (
                        <BuildPlanContextMenu
                          typeId={row.typeId}
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
