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
  EMPTY_BPC_SEARCH_FILTER,
  asContract,
  blueprintOfferStats,
  bpcPriceSummary,
  cheapestByRegion,
  contractRowToSearchRow,
  effectivePrice,
  filterBpcContracts,
  filterBpcSearchRows,
  listedBlueprintTypeOptions,
  ownedBlueprintToSearchRow,
  blueprintSearchName,
  type BlueprintOfferStats,
  type BlueprintTypeOption,
  type BpcContractRow,
  type BpcSearchFilter,
  type BpcSearchRow,
  type BpcSearchSource,
} from '@/engine/contracts/bpcSearch';
import {
  loadPublicBpcContracts,
  type PublicBpcContractsSnapshot,
} from '@/features/bpcContracts/syncedContracts';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { BpcContractModal } from '@/features/bpcContracts/BpcContractModal';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadBlueprints } from '@/sde/loadSde';
import { isSyncConfigured } from '@/app/syncStatus';
import type { CachedResult } from '@/esi/cache';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

interface Snapshot {
  contractsResult: CachedResult<PublicBpcContractsSnapshot> | null;
  syncConfigured: boolean;
  blueprintNames: Map<number, string>;
  regionNames: Map<number, string>;
  /** A 401/403 fetching these just resolves empty — Industry's own top-level banner (same `loadCharacterBlueprints` call) already covers re-login on every tab. */
  ownedBlueprints: CharacterBlueprint[];
}

async function loadBpcContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  if (!isSyncConfigured()) {
    return {
      contractsResult: null,
      syncConfigured: false,
      blueprintNames: new Map(),
      regionNames: new Map(),
      ownedBlueprints: [],
    };
  }

  const [contractsResult, blueprintMap, ownedResult] = await Promise.all([
    loadPublicBpcContracts(characterId),
    loadBlueprints(),
    // Same data path Industry's build-plan prefill already uses — not a
    // second ESI call for the same thing.
    loadCharacterBlueprints(characterId),
  ]);
  const blueprintNames = new Map(
    Object.entries(blueprintMap).map(([typeId, bp]) => [Number(typeId), bp.name])
  );

  // Already superseded: skip the region-name fan-out, its result would be discarded.
  const rows = contractsResult?.data?.rows ?? [];
  const regionIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.regionId))];
  const regionEntries = await Promise.all(
    regionIds.map(async (id): Promise<[number, string] | null> => {
      const name = await loadRegionName(id);
      return name ? [id, name] : null;
    })
  );
  const regionNames = new Map(regionEntries.filter((entry) => entry !== null));

  return {
    contractsResult,
    syncConfigured: true,
    blueprintNames,
    regionNames,
    ownedBlueprints: ownedResult.cached?.data ?? [],
  };
}

interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  minMe: string;
  minTe: string;
  minRuns: string;
  maxPrice: string;
}

const EMPTY_UI_FILTER: UiFilter = {
  typeQuery: '',
  regionId: null,
  minMe: '',
  minTe: '',
  minRuns: '',
  maxPrice: '',
};

const ALL_REGIONS = 'all';
const TYPE_SEARCH_LIMIT = 50;

/**
 * Blueprints offered in the autocomplete under the search box. Short on
 * purpose: the list sits above the results it is narrowing, so a long one
 * pushes the table off the screen — and past a handful of candidates the
 * answer is to keep typing, not to scroll the suggestions.
 */
const SUGGESTION_LIMIT = 8;

/** Region cells shown in the cheapest-by-region strip, in cheapest-first order — six fills the row at `lg` without wrapping into a second one that would outsize the table below it. */
const REGION_CELL_LIMIT = 6;

/** One row of the search's autocomplete: a candidate blueprint plus what its listings look like, so a dead blueprint is visible before it is chosen. */
type BlueprintSuggestion = BlueprintTypeOption & BlueprintOfferStats;

/** Positive-integer text field to a filter number, or null when blank/invalid — never NaN reaching the engine filter. */
function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Rows shown before "show all" (same precedent as Contracts/the market order book). */
const ROW_CAP = 50;

interface BpcFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: { id: number; name: string }[];
}

function BpcFilterBar({ filter, onChange, regionOptions }: BpcFilterBarProps) {
  const { t } = useTranslation();
  const activeCount = [
    filter.typeQuery,
    filter.regionId !== null,
    filter.minMe,
    filter.minTe,
    filter.minRuns,
    filter.maxPrice,
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
          placeholder={t('bpcContracts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('bpcContracts.regionLabel')}>
            <Select
              value={draft.regionId === null ? ALL_REGIONS : String(draft.regionId)}
              onValueChange={(value) =>
                setDraft({ ...draft, regionId: value === ALL_REGIONS ? null : Number(value) })
              }
            >
              <SelectTrigger aria-label={t('bpcContracts.regionLabel')} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>{t('bpcContracts.allRegions')}</SelectItem>
                {regionOptions.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t('bpcContracts.minMeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              aria-label={t('bpcContracts.minMeLabel')}
              placeholder={t('bpcContracts.minMeLabel')}
              className="w-24"
              value={draft.minMe}
              onChange={(event) => setDraft({ ...draft, minMe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minTeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              aria-label={t('bpcContracts.minTeLabel')}
              placeholder={t('bpcContracts.minTeLabel')}
              className="w-24"
              value={draft.minTe}
              onChange={(event) => setDraft({ ...draft, minTe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minRunsLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('bpcContracts.minRunsLabel')}
              placeholder={t('bpcContracts.minRunsLabel')}
              className="w-24"
              value={draft.minRuns}
              onChange={(event) => setDraft({ ...draft, minRuns: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.maxPriceLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('bpcContracts.maxPriceLabel')}
              placeholder={t('bpcContracts.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
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
 * data — this one is global and Firestore-backed, Industry's is per-character
 * and ESI-backed.
 */
export function BpcSourcingPanel() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadBpcContractsSnapshot,
    undefined,
    { cacheKey: 'bpcContracts' }
  );

  const contractsResult = data?.contractsResult ?? null;
  const syncConfigured = data?.syncConfigured ?? true;
  const blueprintNames = data?.blueprintNames ?? EMPTY_MAP;
  const regionNames = data?.regionNames ?? EMPTY_MAP;
  const ownedBlueprints = data?.ownedBlueprints ?? EMPTY_OWNED_BLUEPRINTS;

  const [uiFilter, setUiFilter] = useState<UiFilter>(EMPTY_UI_FILTER);
  const [showAll, setShowAll] = useState(false);
  /** Both on by default: an existing user must keep seeing today's contract results, plus their owned blueprints, not a narrower default. */
  const [sources, setSources] = useState<ReadonlySet<BpcSearchSource>>(
    () => new Set<BpcSearchSource>(['contract', 'owned'])
  );
  function toggleSource(source: BpcSearchSource) {
    setSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }
  /**
   * The one blueprint the search has been narrowed to, or `null` while the
   * query is still free text. Distinct from `uiFilter.typeQuery`: typing
   * "rifter" narrows the table to every blueprint whose name matches, which is
   * the browse path this page has always had; *choosing* one from the
   * autocomplete is what unlocks the per-blueprint summary and the
   * cheapest-by-region comparison, neither of which means anything averaged
   * across several different blueprints.
   */
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  /** The row whose contract detail is open, if any. */
  const [openRow, setOpenRow] = useState<BpcContractRow | null>(null);

  const rows = useMemo(() => contractsResult?.data?.rows ?? [], [contractsResult]);

  // Merges in owned typeIds, gated on the Owned toggle, so free-text search
  // narrows an Owned-only result even without a contract listing — but never
  // displaces a real contract match out of the ranked window when Owned is
  // off. The autocomplete dropdown below stays contract-offer-flavored either way.
  const typeOptions = useMemo(() => {
    const ownedTypeIds = sources.has('owned')
      ? ownedBlueprints.map((bp) => ({ typeId: bp.type_id }))
      : [];
    return listedBlueprintTypeOptions([...rows, ...ownedTypeIds], blueprintNames);
  }, [rows, ownedBlueprints, sources, blueprintNames]);

  /**
   * Every filter *except* the blueprint itself. Suggestions are counted
   * against this rather than the raw snapshot, so a row reading "40 offers"
   * is never followed one click later by a summary reading "2" — with a
   * region or a min ME set, the count a buyer is choosing between is the
   * filtered one. Keyed on the individual fields rather than `uiFilter`, so
   * typing in the search box does not rebuild it on every keystroke.
   */
  const nonTypeFilter: BpcSearchFilter = useMemo(
    () => ({
      ...EMPTY_BPC_SEARCH_FILTER,
      regionId: uiFilter.regionId,
      minMe: parsePositiveNumber(uiFilter.minMe),
      minTe: parsePositiveNumber(uiFilter.minTe),
      minRuns: parsePositiveNumber(uiFilter.minRuns),
      maxPrice: parsePositiveNumber(uiFilter.maxPrice),
    }),
    [uiFilter.regionId, uiFilter.minMe, uiFilter.minTe, uiFilter.minRuns, uiFilter.maxPrice]
  );

  const suggestionRows = useMemo(
    () => filterBpcContracts(rows, nonTypeFilter),
    [rows, nonTypeFilter]
  );
  const offerStats = useMemo(() => blueprintOfferStats(suggestionRows), [suggestionRows]);

  const suggestions = useMemo<BlueprintSuggestion[]>(() => {
    if (selectedTypeId !== null || uiFilter.typeQuery.trim() === '') return [];
    const matched: BlueprintSuggestion[] = [];
    for (const option of rankedSearch(typeOptions, blueprintSearchName(uiFilter.typeQuery), {
      primary: (option) => blueprintSearchName(option.name),
      limit: SUGGESTION_LIMIT,
    })) {
      // A blueprint with no offers left under the current filters is not a
      // candidate — picking it would resolve to an empty table.
      const stats = offerStats.get(option.typeId);
      if (stats) matched.push({ ...option, ...stats });
    }
    return matched;
  }, [typeOptions, uiFilter.typeQuery, selectedTypeId, offerStats]);

  const selectedName =
    selectedTypeId === null ? null : (blueprintNames.get(selectedTypeId) ?? `#${selectedTypeId}`);

  /** Picking from the autocomplete puts the blueprint's full name in the box, the way a combobox does — the field keeps showing what is being filtered on. */
  function selectBlueprint(suggestion: BlueprintSuggestion) {
    setSelectedTypeId(suggestion.typeId);
    setUiFilter((filter) => ({ ...filter, typeQuery: suggestion.name }));
    setShowAll(false);
  }

  function clearBlueprint() {
    setSelectedTypeId(null);
    setUiFilter((filter) => ({ ...filter, typeQuery: '' }));
    setShowAll(false);
  }

  /** Editing the text drops the pinned blueprint — otherwise the box would show one name while the table filtered on another. */
  function changeFilter(next: UiFilter) {
    if (next.typeQuery !== uiFilter.typeQuery) setSelectedTypeId(null);
    setUiFilter(next);
    // Any filter edit gives a different row set, so an expansion asked for
    // against the previous one no longer means anything — same reset the two
    // blueprint handlers do.
    setShowAll(false);
  }
  const regionOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.regionId))]
        .map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, regionNames]
  );

  const engineFilter: BpcSearchFilter = useMemo(() => {
    const typeIds =
      selectedTypeId !== null
        ? new Set([selectedTypeId])
        : uiFilter.typeQuery.trim().length === 0
          ? null
          : new Set(
              rankedSearch(typeOptions, blueprintSearchName(uiFilter.typeQuery), {
                primary: (o) => blueprintSearchName(o.name),
                limit: TYPE_SEARCH_LIMIT,
              }).map((o) => o.typeId)
            );
    // The blueprint filter laid over the other ones, which `nonTypeFilter`
    // already holds — the two must not drift, or the suggestion counts and
    // the table would answer different questions.
    return { ...nonTypeFilter, typeIds };
  }, [nonTypeFilter, uiFilter.typeQuery, typeOptions, selectedTypeId]);

  // This filter path stays exactly as it was pre-multiselect — the source
  // toggle below only gates what gets merged in alongside it.
  const filteredRows = useMemo(() => filterBpcContracts(rows, engineFilter), [rows, engineFilter]);
  const contractSearchRows = useMemo(
    () => filteredRows.map(contractRowToSearchRow),
    [filteredRows]
  );

  const ownedSearchRows = useMemo(
    () =>
      ownedBlueprints.map((bp) =>
        ownedBlueprintToSearchRow({
          itemId: bp.item_id,
          typeId: bp.type_id,
          runs: bp.runs,
          me: bp.material_efficiency,
          te: bp.time_efficiency,
          quantity: bp.quantity,
        })
      ),
    [ownedBlueprints]
  );
  const filteredOwnedRows = useMemo(
    () => filterBpcSearchRows(ownedSearchRows, engineFilter),
    [ownedSearchRows, engineFilter]
  );

  /**
   * Built from whichever source(s) are toggled on. Owned rows lead: the
   * synced contract snapshot can run to six figures while owned blueprints
   * number in the dozens, so contracts-first would let them fill `ROW_CAP`
   * and push every owned row out of the default (not-`showAll`) view.
   */
  const displayRows = useMemo<BpcSearchRow[]>(() => {
    const contractRows = sources.has('contract') ? contractSearchRows : [];
    const ownedRows = sources.has('owned') ? filteredOwnedRows : [];
    return [...ownedRows, ...contractRows];
  }, [sources, contractSearchRows, filteredOwnedRows]);
  const visibleRows = showAll ? displayRows : displayRows.slice(0, ROW_CAP);

  // Both summarise `filteredRows`, not every row of the chosen blueprint, so
  // they describe what is actually on screen: narrowing to ME ≥ 10 should move
  // "cheapest" to the cheapest ME 10 copy, not keep quoting an ME 0 one the
  // table below no longer lists.
  const summary = useMemo(
    () => (selectedTypeId === null ? null : bpcPriceSummary(filteredRows)),
    [selectedTypeId, filteredRows]
  );
  const regionPrices = useMemo(
    () => (selectedTypeId === null ? [] : cheapestByRegion(filteredRows)),
    [selectedTypeId, filteredRows]
  );

  const columns = useMemo<DataTableColumn<BpcSearchRow>[]>(
    () => [
      {
        id: 'item',
        header: t('bpcContracts.itemColumn'),
        primary: true,
        sortValue: (row) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
      },
      {
        id: 'source',
        header: t('bpcContracts.sourceColumn'),
        sortValue: (row) => row.source,
        render: (row) => (
          <span className="inline-flex items-center rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
            {row.source === 'contract'
              ? t('bpcContracts.sourceContractSingular')
              : t('bpcContracts.sourceOwned')}
          </span>
        ),
      },
      {
        id: 'me',
        header: t('bpcContracts.meColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.me,
        render: (row) => row.me,
      },
      {
        id: 'te',
        header: t('bpcContracts.teColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.te,
        render: (row) => row.te,
      },
      {
        id: 'runs',
        header: t('bpcContracts.runsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.runs,
        // A BPO's -1 renders as ∞, not a nonsensical negative count.
        render: (row) => (row.runs === -1 ? t('bpcContracts.unlimitedRuns') : row.runs),
      },
      {
        id: 'qty',
        header: t('bpcContracts.qtyColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        render: (row) => row.quantity,
      },
      {
        id: 'price',
        header: t('bpcContracts.priceColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        // `effectivePrice`, not the `buyout ?? price` this used to inline: EVE
        // Ref's CSV carries a buyout on non-auction contracts too whenever the
        // field parses, so an item_exchange row with `buyout: 0` sorted to the
        // top of the table while rendering — and now summarising — at its real
        // price. Owned rows sort last (Infinity) rather than reading as cheapest.
        sortValue: (row) => {
          const contract = asContract(row);
          return contract ? effectivePrice(contract) : Infinity;
        },
        render: (row) => {
          const contract = asContract(row);
          if (!contract) return t('bpcContracts.notApplicable');
          return contract.isAuction
            ? contract.buyout !== undefined
              ? t('bpcContracts.buyout', { price: formatIsk(contract.buyout, 2) })
              : t('bpcContracts.startingBid', { price: formatIsk(contract.price, 2) })
            : formatIsk(contract.price, 2);
        },
      },
      {
        id: 'region',
        header: t('bpcContracts.regionColumn'),
        sortValue: (row) => {
          const contract = asContract(row);
          return contract ? (regionNames.get(contract.regionId) ?? `#${contract.regionId}`) : '';
        },
        render: (row) => {
          const contract = asContract(row);
          return contract
            ? (regionNames.get(contract.regionId) ?? `#${contract.regionId}`)
            : t('bpcContracts.notApplicable');
        },
      },
      {
        id: 'expires',
        header: t('bpcContracts.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        // Infinity sorts an owned row last, same as price, rather than epoch 0
        // reading as "expires soonest."
        sortValue: (row) => asContract(row)?.dateExpired ?? Infinity,
        render: (row) => {
          const contract = asContract(row);
          return contract
            ? formatTimestamp(new Date(contract.dateExpired), timeZone)
            : t('bpcContracts.notApplicable');
        },
      },
    ],
    [t, blueprintNames, regionNames, timeZone]
  );

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

  return (
    <Panel
      padded={false}
      // No title of its own: the tab immediately above already reads "BPC
      // Search", and repeating it in the panel header directly beneath reads
      // as a stutter. The header still renders — `meta` and `actions` are
      // enough — so the badge and Refresh keep the toolbar they moved onto,
      // and the table keeps its own accessible name from `bpcContracts.title`.
      meta={
        contractsResult?.data?.lastSyncedAt && (
          <DataAgeBadge date={new Date(contractsResult.data.lastSyncedAt)} />
        )
      }
      actions={
        <IconButton
          icon={<Icon.Refresh />}
          label={t('bpcContracts.refresh')}
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
          title={t('bpcContracts.notConfiguredTitle')}
          hint={t('bpcContracts.notConfiguredHint')}
        />
      ) : rows.length === 0 && ownedBlueprints.length === 0 ? (
        // Nothing to search from either source — distinct from
        // `noFilterMatches` below, which is "some data exists, the filter
        // just excludes it all."
        <EmptyState title={t('bpcContracts.emptyTitle')} hint={t('bpcContracts.emptyHint')} />
      ) : (
        <>
          {contractsResult?.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <BpcFilterBar filter={uiFilter} onChange={changeFilter} regionOptions={regionOptions} />

          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
            <span className="text-text-dim">{t('bpcContracts.sourceLabel')}</span>
            <FilterChip
              label={t('bpcContracts.sourceContracts')}
              selected={sources.has('contract')}
              onToggle={() => toggleSource('contract')}
            />
            <FilterChip
              label={t('bpcContracts.sourceOwned')}
              selected={sources.has('owned')}
              onToggle={() => toggleSource('owned')}
            />
          </div>

          {/* Inset on its own ground with an accent edge, because as a plain
              list flush against the filter bar it read as more page furniture
              and went unnoticed — the whole feature hangs on picking from it. */}
          {suggestions.length > 0 && (
            <div className="border-b border-line bg-panel-2 px-3 py-2">
              <p className="pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                {t('bpcContracts.suggestionsHeading')}
              </p>
              <ul
                aria-label={t('bpcContracts.suggestionsLabel')}
                className="max-h-72 overflow-y-auto rounded-xs border border-line-bright bg-panel"
              >
                {suggestions.map((suggestion) => (
                  <li key={suggestion.typeId} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      onClick={() => selectBlueprint(suggestion)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
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
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedName !== null && summary !== null && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{selectedName}</p>
                <p className="text-[0.6875rem] text-text-dim">
                  {t('bpcContracts.offersOnContract', { count: summary.offerCount })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                {summary.cheapest !== null && (
                  <StatChip
                    label={t('bpcContracts.cheapestLabel')}
                    value={formatIsk(summary.cheapest, 2)}
                  />
                )}
                {summary.median !== null && (
                  <StatChip
                    label={t('bpcContracts.medianLabel')}
                    value={formatIsk(summary.median, 2)}
                  />
                )}
                {summary.bestMe !== null && summary.bestTe !== null && (
                  <StatChip
                    label={t('bpcContracts.bestMeTeLabel')}
                    value={`${summary.bestMe} / ${summary.bestTe}`}
                  />
                )}
                <IconButton
                  icon={<Icon.Close />}
                  label={t('bpcContracts.clearBlueprint', { name: selectedName })}
                  tooltip={t('bpcContracts.clearBlueprintShort')}
                  size="sm"
                  onClick={clearBlueprint}
                />
              </div>
            </div>
          )}

          {regionPrices.length > 1 && (
            <div className="border-b border-line px-3 py-2">
              {/* Says so when it is showing a subset: the cheapest region always
                  survives the slice, but a blueprint listed in twenty regions
                  would otherwise show six with nothing admitting it. */}
              <p className="pb-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {regionPrices.length > REGION_CELL_LIMIT
                  ? t('bpcContracts.cheapestByRegionCapped', {
                      shown: REGION_CELL_LIMIT,
                      total: regionPrices.length,
                    })
                  : t('bpcContracts.cheapestByRegion')}
              </p>
              {/* Cheapest first, so the ordering carries the answer and the
                  accent on the leading cell is only reinforcement (DESIGN.md §7). */}
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {regionPrices.slice(0, REGION_CELL_LIMIT).map((region, index) => (
                  <li
                    key={region.regionId}
                    className={cx(
                      'flex flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-2',
                      index === 0 ? 'border-accent-dim' : 'border-line'
                    )}
                  >
                    <span className="truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {regionNames.get(region.regionId) ?? `#${region.regionId}`}
                    </span>
                    <span className={cx('text-sm tabular-nums', index === 0 && 'text-accent')}>
                      {formatIsk(region.cheapest, 2)}
                    </span>
                    <span className="text-[0.6875rem] tabular-nums text-text-dim">
                      {t('bpcContracts.regionOffers', { count: region.offerCount })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sources.size === 0 ? (
            <EmptyState title={t('bpcContracts.noSourceSelected')} className="py-8" />
          ) : displayRows.length === 0 ? (
            <EmptyState title={t('bpcContracts.noFilterMatches')} className="py-8" />
          ) : (
            <>
              <DataTable
                label={t('bpcContracts.title')}
                columns={columns}
                rows={visibleRows}
                // Index included deliberately: a contract lists the same
                // blueprint once per copy, so contractId+typeId is not
                // unique — 70% of rows in a live pull shared one, and the
                // duplicate React keys left the previous blueprint's rows
                // in the table beside the chosen one. An owned row's
                // item_id is already unique on its own.
                rowKey={(row, index) =>
                  row.source === 'contract'
                    ? `${row.contract.contractId}:${row.typeId}:${index}`
                    : `owned:${row.itemId}`
                }
                defaultSort={{ columnId: 'price', direction: 'asc' }}
                // No contract exists for an owned row — nothing to open.
                onRowClick={(row) => setOpenRow(asContract(row))}
                rowContextMenu={(row, tr) => (
                  // The Offer's own ME/TE/runs, not the defaults, so a pilot
                  // shopping a specific copy sees what *that* copy builds. A
                  // BPO's -1 runs falls back to the unseeded default instead
                  // of a fabricated run count.
                  <BuildPlanContextMenu
                    typeId={row.typeId}
                    seed={row.runs === -1 ? null : { me: row.me, te: row.te, runs: row.runs }}
                    trigger={tr}
                  />
                )}
              />
              {!showAll && displayRows.length > ROW_CAP && (
                <div className="px-3 py-2">
                  <Button size="sm" onClick={() => setShowAll(true)}>
                    {t('bpcContracts.showAll', { count: displayRows.length })}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {openRow !== null && (
        <BpcContractModal
          row={openRow}
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
  );
}

/** Stable identity, so a missing snapshot doesn't invalidate memoized columns/options every render. */
const EMPTY_MAP: ReadonlyMap<number, string> = new Map();
const EMPTY_OWNED_BLUEPRINTS: CharacterBlueprint[] = [];
