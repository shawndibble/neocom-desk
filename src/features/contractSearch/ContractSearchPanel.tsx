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
import { resolveCourierRoutes, type CourierRouteRow } from '@/engine/contracts/courierSearch';
import {
  loadPublicContractOffers,
  type PublicContractOffersSnapshot,
} from '@/features/contractSearch/publicContractOffers';
import {
  loadPublicCourierContracts,
  type PublicCourierContractsSnapshot,
} from '@/features/contractSearch/publicCourierContracts';
import { loadCourierEndpoints } from '@/features/contractSearch/courierEndpoints';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { CachedResult } from '@/esi/cache';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
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

const EMPTY_NAMES: ReadonlyMap<number, string> = new Map();
const EMPTY_ROWS: readonly PublicContractOfferRow[] = [];
const EMPTY_COURIER_ROWS: readonly CourierRouteRow[] = [];

interface Snapshot {
  offersResult: CachedResult<PublicContractOffersSnapshot> | null;
  courierResult: CachedResult<PublicCourierContractsSnapshot> | null;
  /** Courier rows with both ends already named — resolved once here, not per render. */
  courierRoutes: CourierRouteRow[];
  /** False when the app has no sync backend configured at all — a different story from "synced, but empty". */
  syncConfigured: boolean;
  regionNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
}

const NOT_CONFIGURED: Snapshot = {
  offersResult: null,
  courierResult: null,
  courierRoutes: [],
  syncConfigured: false,
  regionNames: EMPTY_NAMES,
  typeNames: EMPTY_NAMES,
};

/**
 * Names come from the market catalogue (`public/data/market/types.json`), not
 * `loadTypeNames`: the slim `types.json` the latter reads first only covers
 * skill- and blueprint-referenced types, so a general contract corpus would
 * send most of its ids to the batched `POST /universe/names` fan-out on every
 * tab open. The catalogue already names every published market type, is
 * fetched lazily, and is what the Market Browser's own search runs against.
 */
async function loadContractSearchSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  if (!isSyncConfigured()) return NOT_CONFIGURED;
  // Both snapshots, always. The courier one is a single chunk doc — ADR 0013's
  // live pull put courier and loan together under 620 contracts against ~370k
  // offer rows — so deferring it to the first Courier click would buy nothing
  // and cost a fetch on the way in.
  const [offersResult, courierResult] = await Promise.all([
    loadPublicContractOffers(characterId),
    loadPublicCourierContracts(characterId),
  ]);
  const rows = offersResult?.data?.rows ?? [];
  const courierRows = courierResult?.data?.rows ?? [];
  // Already superseded: skip the lookups, their results would be discarded.
  if (signal.cancelled) {
    return {
      offersResult,
      courierResult,
      courierRoutes: [],
      syncConfigured: true,
      regionNames: EMPTY_NAMES,
      typeNames: EMPTY_NAMES,
    };
  }

  const listedTypeIds = new Set(rows.map((row) => row.typeId));
  const catalog = await loadMarketTypes();
  const typeNames = new Map<number, string>();
  for (const entry of catalog) {
    if (listedTypeIds.has(entry.typeId)) typeNames.set(entry.typeId, entry.name);
  }

  // Local SDE snapshots only, so this costs no requests at all — see
  // `courierEndpoints.ts` for why it is not `loadContractLocationName`.
  const endpoints = await loadCourierEndpoints(courierRows);
  const courierRoutes = resolveCourierRoutes(courierRows, endpoints);

  // One lookup per distinct region across both corpora: the offers' own, plus
  // each end of every haul. A courier region resolved here is what names the
  // From/To options in the Courier filter bar.
  const regionIds = new Set<number>(rows.map((row) => row.regionId));
  for (const route of courierRoutes) {
    if (route.origin.regionId !== null) regionIds.add(route.origin.regionId);
    if (route.destination.regionId !== null) regionIds.add(route.destination.regionId);
  }
  const regionNames = new Map<number, string>();
  await Promise.all(
    [...regionIds].map(async (regionId) => {
      const name = await loadRegionName(regionId);
      if (name !== null) regionNames.set(regionId, name);
    })
  );

  return {
    offersResult,
    courierResult,
    courierRoutes,
    syncConfigured: true,
    regionNames,
    typeNames,
  };
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
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContractSearchSnapshot,
    undefined,
    { cacheKey: 'contractSearch' }
  );

  const offersResult = data?.offersResult ?? null;
  const syncConfigured = data?.syncConfigured ?? true;
  const regionNames = data?.regionNames ?? EMPTY_NAMES;
  const typeNames = data?.typeNames ?? EMPTY_NAMES;
  const rows = offersResult?.data?.rows ?? EMPTY_ROWS;
  const courierResult = data?.courierResult ?? null;
  const courierRoutes = data?.courierRoutes ?? EMPTY_COURIER_ROWS;

  const [uiFilter, setUiFilter] = useState<UiFilter>(EMPTY_UI_FILTER);
  /** The type the user picked out of the suggestion list, pinning the search to exactly one item. */
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<ContractMode>('items');

  // Freshness and the offline banner both name the snapshot actually on
  // screen: the two are published by the same job but cached separately, so a
  // courier read served from Dexie under a live offers read is a real state.
  const activeResult = mode === 'courier' ? courierResult : offersResult;
  const modeRowCount = mode === 'courier' ? courierRoutes.length : rows.length;

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

  if (!hydrated || activeCharacterId === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
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
          disabled={loading}
        />
      }
    >
      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !syncConfigured ? (
        <EmptyState
          title={t('contractSearch.notConfiguredTitle')}
          hint={t('contractSearch.notConfiguredHint')}
        />
      ) : (
        <>
          {activeResult?.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
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
          {modeRowCount === 0 ? (
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
                      <li key={suggestion.typeId} className="border-b border-line last:border-b-0">
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
  );
}
