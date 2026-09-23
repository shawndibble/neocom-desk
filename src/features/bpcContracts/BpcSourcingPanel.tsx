import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  IskAmount,
  Panel,
  RegionSelect,
  SearchInput,
  Spinner,
  StatChip,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  BPC_SOURCING_PARAMS,
  BPC_SOURCING_SORT_KEY,
  DEFAULT_SOURCE_TOGGLES,
  SOURCE_TOGGLES,
  type SourceToggle,
} from './bpcSourcingUrl';
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
  iskPerRun,
  listedBlueprintTypeOptions,
  marketBpoToSearchRow,
  ownedBlueprintToSearchRow,
  blueprintSearchName,
  type BlueprintOfferStats,
  type BlueprintTypeOption,
  type BpcContractRow,
  type BpcSearchFilter,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import {
  loadPublicBpcContracts,
  type PublicBpcContractsSnapshot,
} from '@/features/bpcContracts/syncedContracts';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import {
  loadBlueprintLocation,
  loadContractLocationInfo,
  type ContractLocationInfo,
  type ResolvedLocation,
} from '@/features/bpcContracts/blueprintLocation';
import {
  BPC_SEARCH_COLUMN_IDS,
  useVisibleBpcSearchColumns,
  type BpcSearchColumnId,
} from '@/features/bpcContracts/bpcSearchColumns';
import { useSpaceFilter } from '@/features/bpcContracts/bpcSpaceFilterPref';
import { BpcContractModal } from '@/features/bpcContracts/BpcContractModal';
import { BpoBadge } from '@/features/bpcContracts/BpoBadge';
import { BpoCard } from '@/features/bpcContracts/BpoCard';
import { useOfferLocations } from '@/features/contractSearch/offerLocations';
import {
  bpoBadgeRows,
  bpoMayBeCheaper,
  cheaperBpo,
  cheapestBpoSourcesByType,
  cheapestComparableCopy,
  cheapestSourcingCard,
  type BpoOffer,
  marketBpoOffers,
} from '@/features/bpcContracts/bpoAvailability';
import {
  MARKET_BPO_LOOKUP_LIMIT,
  useMarketBpoOrders,
} from '@/features/bpcContracts/useMarketBpoOrders';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
import { DEFAULT_JUMP_RANGE, withinJumpRange, type JumpRange } from '@/engine/route/jumpRange';
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
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadBlueprints } from '@/sde/loadSde';
import { isSyncConfigured } from '@/app/syncStatus';
import type { CachedResult } from '@/esi/cache';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

interface Snapshot {
  contractsResult: CachedResult<PublicBpcContractsSnapshot> | null;
  syncConfigured: boolean;
  blueprintNames: Map<number, string>;
  regionNames: Map<number, string>;
  /** A 401/403 fetching these just resolves empty — Industry's own top-level banner (same `loadCharacterBlueprints` call) already covers re-login on every tab. */
  ownedBlueprints: CharacterBlueprint[];
  /** Keyed by `BpcContractRow.locationId`. SDE-only (issue #796) — see `loadContractLocationInfo`. */
  contractLocations: Map<number, ContractLocationInfo>;
  /** Keyed by `CharacterBlueprint.location_id`, this character's ACL. */
  ownedLocations: Map<number, ResolvedLocation>;
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
      contractLocations: new Map(),
      ownedLocations: new Map(),
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
  // Originals ride along (issue #1241): the Contract BPOs source and the BPO
  // badge name their region and station too.
  const rows = [
    ...(contractsResult?.data?.rows ?? []),
    ...(contractsResult?.data?.originals ?? []),
  ];
  const regionIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.regionId))];
  const regionEntries = await Promise.all(
    regionIds.map(async (id): Promise<[number, string] | null> => {
      const name = await loadRegionName(id);
      return name ? [id, name] : null;
    })
  );
  const regionNames = new Map(regionEntries.filter((entry) => entry !== null));

  const ownedBlueprints = ownedResult.cached?.data ?? [];

  const contractLocationIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.locationId))];
  const contractLocationEntries = await Promise.all(
    contractLocationIds.map(async (id): Promise<[number, ContractLocationInfo]> => [
      id,
      await loadContractLocationInfo(id),
    ])
  );
  const contractLocations = new Map(contractLocationEntries);

  const ownedLocationIds = signal.cancelled
    ? []
    : [...new Set(ownedBlueprints.map((bp) => bp.location_id))];
  const ownedLocationEntries = await Promise.all(
    ownedLocationIds.map(async (id): Promise<[number, ResolvedLocation]> => [
      id,
      await loadBlueprintLocation(characterId, id),
    ])
  );
  const ownedLocations = new Map(ownedLocationEntries);

  return {
    contractsResult,
    syncConfigured: true,
    blueprintNames,
    regionNames,
    ownedBlueprints,
    contractLocations,
    ownedLocations,
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

const TYPE_SEARCH_LIMIT = 50;

/**
 * Blueprints offered in the autocomplete under the search box. Short on
 * purpose: the list sits above the results it is narrowing, so a long one
 * pushes the table off the screen — and past a handful of candidates the
 * answer is to keep typing, not to scroll the suggestions.
 */
const SUGGESTION_LIMIT = 8;

/** Region cells shown in the cheapest-by-region strip, in cheapest-first order — six keeps the strip (plus the BPO cards beside it) from wrapping into rows that would outsize the table below it. */
const REGION_CELL_LIMIT = 6;

/** Section header over each group in the sourcing strip: Cheapest by region, Market BPOs, Contract BPOs. */
const SOURCING_GROUP_HEADER =
  'pb-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/** One card width for region and BPO cards alike: two across on a phone, fixed from `sm` so the groups share a row. */
const SOURCING_CARD_WIDTH = 'w-[calc(50%-0.25rem)] sm:w-36';

/** One row of the search's autocomplete: a candidate blueprint plus what its listings look like, so a dead blueprint is visible before it is chosen. */
type BlueprintSuggestion = BlueprintTypeOption & BlueprintOfferStats;

/** Positive-integer text field to a filter number, or null when blank/invalid — never NaN reaching the engine filter. */
function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Space and Jump Range narrow contract rows up front — see `spaceFilteredRows`' comment. */
function narrowByLocation(
  rows: BpcContractRow[],
  kinds: ReadonlySet<SpaceKind> | null,
  allowedSystems: ReadonlySet<number> | null,
  locations: ReadonlyMap<number, ContractLocationInfo>
): BpcContractRow[] {
  if (!kinds && !allowedSystems) return rows;
  return rows.filter((row) => {
    const location = locations.get(row.locationId);
    if (kinds && (location?.space == null || !kinds.has(location.space))) return false;
    return withinJumpRange(location?.systemId, allowedSystems);
  });
}

/** The market lookup's region: the Region filter's, else the pilot's market hub's once known. */
function marketLookupRegion(
  regionId: number | null,
  hubHydrated: boolean,
  hubRegionId: number
): number | null {
  if (regionId !== null) return regionId;
  return hubHydrated ? hubRegionId : null;
}

/** The Trade Hub station in `regionId`, or 0 when the region holds none — nothing gets marked. */
function hubStationIn(regionId: number | null): number {
  return TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId ?? 0;
}

const OFFERS_DEFAULT_SORT = { columnId: 'price', direction: 'asc' } as const;

/** Rows shown before "show all" (same precedent as Contracts/the market order book). */
const ROW_CAP = 50;

function isDefaultSources(sources: ReadonlySet<SourceToggle>): boolean {
  return (
    sources.size === DEFAULT_SOURCE_TOGGLES.length &&
    DEFAULT_SOURCE_TOGGLES.every((s) => sources.has(s))
  );
}

const SOURCE_LABEL_KEYS: Record<SourceToggle, string> = {
  contract: 'bpcContracts.sourceContracts',
  contractBpo: 'bpcContracts.sourceContractBpos',
  market: 'bpcContracts.sourceMarketBpos',
  owned: 'bpcContracts.sourceOwned',
};

const SOURCE_TOOLTIP_KEYS: Partial<Record<SourceToggle, string>> = {
  contractBpo: 'bpcContracts.sourceContractBposTooltip',
  market: 'bpcContracts.sourceMarketBposTooltip',
};

interface BpcFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: { id: number; name: string }[];
  sources: ReadonlySet<SourceToggle>;
  onSourcesChange: (next: ReadonlySet<SourceToggle>) => void;
  spaceKinds: readonly SpaceKind[];
  onSpaceKindsChange: (next: readonly SpaceKind[]) => void;
  jumps: JumpRange;
  onJumpsChange: (next: JumpRange) => void;
  currentSystem: CurrentSystemState;
}

function BpcFilterBar({
  filter,
  onChange,
  regionOptions,
  sources,
  onSourcesChange,
  spaceKinds,
  onSpaceKindsChange,
  jumps,
  onJumpsChange,
  currentSystem,
}: BpcFilterBarProps) {
  const { t } = useTranslation();
  const activeCount = [
    filter.typeQuery,
    filter.regionId !== null,
    filter.minMe,
    filter.minTe,
    filter.minRuns,
    filter.maxPrice,
    !isDefaultSources(sources),
    spaceKinds.length !== SPACE_KINDS.length,
    jumps !== DEFAULT_JUMP_RANGE,
  ].filter(Boolean).length;

  const compositeValue = { ...filter, sources, spaceKinds, jumps };

  /** Widened past `UiFilter` so Source/Space/Distance buffer and commit through the same draft/Apply/Cancel as the other fields (matching Contracts.tsx and Market's FilterBar usage) instead of applying instantly. Space is a Dexie-backed preference, written here and nowhere else, so Cancel never leaves a store write to roll back. */
  function handleCompositeChange(next: typeof compositeValue) {
    const {
      sources: nextSources,
      spaceKinds: nextSpaceKinds,
      jumps: nextJumps,
      ...restFilter
    } = next;
    onChange(restFilter);
    if (nextSources !== sources) onSourcesChange(nextSources);
    if (nextSpaceKinds !== spaceKinds) onSpaceKindsChange(nextSpaceKinds);
    if (nextJumps !== jumps) onJumpsChange(nextJumps);
  }

  return (
    <FilterBar
      value={compositeValue}
      onChange={handleCompositeChange}
      activeCount={activeCount}
      // Six fields plus two chip groups wrap to three rows inline, above
      // the table they exist to narrow.
      collapsible
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
            <RegionSelect
              options={regionOptions}
              value={draft.regionId}
              onChange={(regionId) => setDraft({ ...draft, regionId })}
              allLabel={t('bpcContracts.allRegions')}
              searchPlaceholder={t('common.searchRegions')}
              noResultsLabel={t('common.noRegionMatches')}
              aria-label={t('bpcContracts.regionLabel')}
              className="w-48"
            />
          </FilterField>
          <FilterField label={t('jumpRange.label')}>
            <div className="flex flex-wrap items-center gap-2">
              <JumpRangeSelect
                value={draft.jumps}
                onChange={(next) => setDraft({ ...draft, jumps: next })}
              />
              <CurrentSystemPicker current={currentSystem} />
            </div>
          </FilterField>
          <FilterField label={t('jumpRange.label')}>
            <div className="flex flex-wrap items-center gap-2">
              <JumpRangeSelect
                value={draft.jumps}
                onChange={(next) => setDraft({ ...draft, jumps: next })}
              />
              <CurrentSystemPicker current={currentSystem} />
            </div>
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
          <div
            role="group"
            aria-label={t('bpcContracts.sourceLabel')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-text-dim">{t('bpcContracts.sourceLabel')}</span>
            {SOURCE_TOGGLES.map((source) => (
              <FilterChip
                key={source}
                label={t(SOURCE_LABEL_KEYS[source])}
                tooltip={SOURCE_TOOLTIP_KEYS[source] && t(SOURCE_TOOLTIP_KEYS[source])}
                selected={draft.sources.has(source)}
                onToggle={() => {
                  const next = new Set(draft.sources);
                  if (next.has(source)) next.delete(source);
                  else next.add(source);
                  setDraft({ ...draft, sources: next });
                }}
              />
            ))}
          </div>
          <div
            role="group"
            aria-label={t('bpcContracts.spaceLabel')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-text-dim">{t('bpcContracts.spaceLabel')}</span>
            {SPACE_KINDS.map((kind) => (
              <FilterChip
                key={kind}
                label={t(`common.spaceOption.${kind}`)}
                selected={draft.spaceKinds.includes(kind)}
                onToggle={() => {
                  const next = draft.spaceKinds.includes(kind)
                    ? draft.spaceKinds.filter((existing) => existing !== kind)
                    : [...draft.spaceKinds, kind];
                  setDraft({ ...draft, spaceKinds: next });
                }}
              />
            ))}
          </div>
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
  const contractLocations = data?.contractLocations ?? EMPTY_CONTRACT_LOCATIONS;
  const ownedLocations = data?.ownedLocations ?? EMPTY_OWNED_LOCATIONS;

  const spaceFilter = useSpaceFilter((state) => state.value);
  const setSpaceFilter = useSpaceFilter((state) => state.setValue);
  const hydrateSpaceFilter = useSpaceFilter((state) => state.hydrate);
  useEffect(() => {
    void hydrateSpaceFilter();
  }, [hydrateSpaceFilter]);

  const visibleColumns = useVisibleBpcSearchColumns((state) => state.value);
  const setVisibleColumns = useVisibleBpcSearchColumns((state) => state.setValue);
  const hydrateVisibleColumns = useVisibleBpcSearchColumns((state) => state.hydrate);
  useEffect(() => {
    void hydrateVisibleColumns();
  }, [hydrateVisibleColumns]);

  function toggleColumn(id: BpcSearchColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  // Search, filters, sources, Show all and the pinned blueprint all live in
  // the URL (`bpcSourcingUrl.ts`), one group so a handler that changes
  // several at once writes them in one navigation.
  const [params, setParams] = useUrlParams(BPC_SOURCING_PARAMS);
  const uiFilter: UiFilter = useMemo(
    () => ({
      typeQuery: params['sourcing.q'],
      regionId: params['sourcing.region'],
      minMe: params['sourcing.minMe'],
      minTe: params['sourcing.minTe'],
      minRuns: params['sourcing.minRuns'],
      maxPrice: params['sourcing.maxPrice'],
    }),
    [params]
  );
  const showAll = params['sourcing.all'];
  const sources = params['sourcing.src'];
  const jumps = params['sourcing.jumps'];
  const currentSystem = useCurrentSystem();
  const jumpFilter = useJumpRangeFilter(currentSystem, jumps);
  /**
   * The one blueprint the search has been narrowed to, or `null` while the
   * query is still free text. Distinct from `uiFilter.typeQuery`: typing
   * "rifter" narrows the table to every blueprint whose name matches, which is
   * the browse path this page has always had; *choosing* one from the
   * autocomplete is what unlocks the per-blueprint summary and the
   * cheapest-by-region comparison, neither of which means anything averaged
   * across several different blueprints. A "search BPC Sourcing" link
   * (`bpcSourcingHref`, issue #839) arrives with only this set.
   */
  const selectedTypeId = params['sourcing.type'];
  /** The row whose contract detail is open, if any. */
  const [openRow, setOpenRow] = useState<BpcContractRow | null>(null);

  const rows = useMemo(() => contractsResult?.data?.rows ?? [], [contractsResult]);
  /** Contract originals (issue #1241). Absent on a snapshot cached before #1240. */
  const originals = useMemo(() => contractsResult?.data?.originals ?? [], [contractsResult]);

  // The market BPO lookup's region when the Region filter is "All regions":
  // an Order Book is one region's, so it falls back to the pilot's own market
  // hub rather than guessing (issue #1241).
  const marketHubId = useMarketHub((state) => state.value);
  const marketHubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateMarketHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateMarketHub();
  }, [hydrateMarketHub]);
  const marketHub = getTradeHub(marketHubId) ?? DEFAULT_TRADE_HUB;
  const [marketRefreshTick, setMarketRefreshTick] = useState(0);

  /** `null` when every kind is checked — the filter's own default, a no-op. */
  const activeSpaceKinds = useMemo(
    () => (spaceFilter.length === SPACE_KINDS.length ? null : new Set(spaceFilter)),
    [spaceFilter]
  );

  // Space narrows contract rows before anything downstream sees them:
  // `BpcContractRow` carries no `space` field of its own (it's resolved
  // separately, keyed by `locationId`, since ADR 0013 already deferred exact
  // location resolution for these rows) so `filterBpcContracts` — which
  // stays untouched — cannot filter on it the way it does region/ME/TE. Doing
  // it here instead keeps the suggestion counts and the displayed table
  // agreeing on what "40 offers" means, the same property `nonTypeFilter`
  // below already protects for the other criteria.
  // Jump Range rides the same pass, for the same reason. A row that cannot be
  // placed drops out once a range is active (`withinJumpRange`).
  const spaceFilteredRows = useMemo(
    () => narrowByLocation(rows, activeSpaceKinds, jumpFilter.allowed, contractLocations),
    [rows, activeSpaceKinds, jumpFilter.allowed, contractLocations]
  );
  const spaceFilteredOriginals = useMemo(
    () => narrowByLocation(originals, activeSpaceKinds, jumpFilter.allowed, contractLocations),
    [originals, activeSpaceKinds, jumpFilter.allowed, contractLocations]
  );

  // Merges in owned typeIds, gated on the Owned toggle, so free-text search
  // narrows an Owned-only result even without a contract listing — but never
  // displaces a real contract match out of the ranked window when Owned is
  // off. The autocomplete dropdown below stays contract-offer-flavored either way.
  const typeOptions = useMemo(() => {
    const ownedTypeIds = sources.has('owned')
      ? ownedBlueprints.map((bp) => ({ typeId: bp.type_id }))
      : [];
    const listedOriginals = sources.has('contractBpo') ? spaceFilteredOriginals : [];
    return listedBlueprintTypeOptions(
      [...spaceFilteredRows, ...listedOriginals, ...ownedTypeIds],
      blueprintNames
    );
  }, [spaceFilteredRows, spaceFilteredOriginals, ownedBlueprints, sources, blueprintNames]);

  /**
   * Every blueprint in the SDE, for the market lookup only: an NPC-seeded BPO
   * nobody has contracted is exactly what it must find, and `typeOptions`
   * only holds listed or owned types.
   */
  const allBlueprintOptions = useMemo(
    () =>
      [...blueprintNames.entries()]
        .map(([typeId, name]) => ({ typeId, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [blueprintNames]
  );

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
      spaceKinds: activeSpaceKinds,
      allowedSystems: jumpFilter.allowed,
    }),
    [
      uiFilter.regionId,
      uiFilter.minMe,
      uiFilter.minTe,
      uiFilter.minRuns,
      uiFilter.maxPrice,
      activeSpaceKinds,
      jumpFilter.allowed,
    ]
  );

  const suggestionRows = useMemo(
    () => filterBpcContracts(spaceFilteredRows, nonTypeFilter),
    [spaceFilteredRows, nonTypeFilter]
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
    setParams({
      'sourcing.type': suggestion.typeId,
      'sourcing.q': suggestion.name,
      'sourcing.all': false,
    });
  }

  function clearBlueprint() {
    setParams({ 'sourcing.type': null, 'sourcing.q': '', 'sourcing.all': false });
  }

  /** Editing the text drops the pinned blueprint — otherwise the box would show one name while the table filtered on another. */
  function changeFilter(next: UiFilter) {
    setParams({
      ...(next.typeQuery !== uiFilter.typeQuery ? { 'sourcing.type': null } : {}),
      'sourcing.q': next.typeQuery,
      'sourcing.region': next.regionId,
      'sourcing.minMe': next.minMe,
      'sourcing.minTe': next.minTe,
      'sourcing.minRuns': next.minRuns,
      'sourcing.maxPrice': next.maxPrice,
      // Any filter edit gives a different row set, so an expansion asked for
      // against the previous one no longer means anything — same reset the
      // two blueprint handlers do.
      'sourcing.all': false,
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

  /**
   * The blueprint types the market is checked for BPOs (issue #1241): the
   * chosen blueprint, else the closest typed matches across the whole SDE,
   * else none — never every type in the results (`useMarketBpoOrders`).
   */
  const marketLookup = useMemo(() => {
    if (selectedTypeId !== null) return { typeIds: [selectedTypeId], capped: false };
    if (uiFilter.typeQuery.trim() === '') return { typeIds: [], capped: false };
    const matches = rankedSearch(allBlueprintOptions, blueprintSearchName(uiFilter.typeQuery), {
      primary: (o) => blueprintSearchName(o.name),
      limit: MARKET_BPO_LOOKUP_LIMIT + 1,
    }).map((o) => o.typeId);
    return {
      typeIds: matches.slice(0, MARKET_BPO_LOOKUP_LIMIT),
      capped: matches.length > MARKET_BPO_LOOKUP_LIMIT,
    };
  }, [selectedTypeId, uiFilter.typeQuery, allBlueprintOptions]);
  const marketRegionId = useMemo(
    () => marketLookupRegion(uiFilter.regionId, marketHubHydrated, marketHub.regionId),
    [uiFilter.regionId, marketHubHydrated, marketHub.regionId]
  );
  const marketHubStationId = useMemo(() => hubStationIn(marketRegionId), [marketRegionId]);
  const market = useMarketBpoOrders(marketRegionId, marketLookup.typeIds, marketRefreshTick);

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

  // This filter path stays exactly as it was pre-multiselect (space already
  // narrowed via `spaceFilteredRows`) — the source toggle below only gates
  // what gets merged in alongside it.
  const filteredRows = useMemo(
    () => filterBpcContracts(spaceFilteredRows, engineFilter),
    [spaceFilteredRows, engineFilter]
  );
  const contractSearchRows = useMemo(
    () =>
      filteredRows.map((row) => contractRowToSearchRow(row, contractLocations.get(row.locationId))),
    [filteredRows, contractLocations]
  );

  const ownedSearchRows = useMemo(
    () =>
      ownedBlueprints.map((bp) => {
        const location = ownedLocations.get(bp.location_id);
        return ownedBlueprintToSearchRow({
          itemId: bp.item_id,
          typeId: bp.type_id,
          runs: bp.runs,
          me: bp.material_efficiency,
          te: bp.time_efficiency,
          quantity: bp.quantity,
          locationName: location?.name ?? null,
          regionId: location?.regionId ?? null,
          space: location?.space ?? null,
          systemId: location?.systemId ?? null,
        });
      }),
    [ownedBlueprints, ownedLocations]
  );
  const filteredOwnedRows = useMemo(
    () => filterBpcSearchRows(ownedSearchRows, engineFilter),
    [ownedSearchRows, engineFilter]
  );

  const contractBpoSearchRows = useMemo(
    () =>
      filterBpcContracts(spaceFilteredOriginals, engineFilter).map((row) =>
        contractRowToSearchRow(row, contractLocations.get(row.locationId))
      ),
    [spaceFilteredOriginals, engineFilter, contractLocations]
  );

  // Already limited to the looked-up types, so filtered on everything but the
  // listed-type search (`engineFilter.typeIds` only knows listed types).
  const marketSearchRows = useMemo(() => {
    if (marketRegionId === null) return [];
    const searchRows: BpcSearchRow[] = [];
    for (const [typeId, book] of market.booksByType) {
      for (const offer of marketBpoOffers(book.sell, book.regionId, marketHubStationId)) {
        const location = market.locations.get(offer.locationId);
        searchRows.push(
          marketBpoToSearchRow({
            orderId: offer.orderId,
            typeId,
            regionId: offer.regionId,
            locationId: offer.locationId,
            price: offer.price,
            volumeRemain: offer.volumeRemain,
            atHub: offer.atHub,
            locationName: location?.name ?? null,
            space: location?.space ?? null,
            systemId: location?.systemId ?? null,
          })
        );
      }
    }
    return filterBpcSearchRows(searchRows, nonTypeFilter);
  }, [market.booksByType, market.locations, marketRegionId, marketHubStationId, nonTypeFilter]);

  /**
   * The cheapest BPO per blueprint type in the results (issue #1241):
   * contract originals in the Region filter's scope, market orders for the
   * looked-up types only.
   */
  const bpoSourcesByType = useMemo(() => {
    const typeIds = new Set(marketLookup.typeIds);
    for (const row of filteredRows) typeIds.add(row.typeId);
    for (const row of filteredOwnedRows) typeIds.add(row.typeId);
    return cheapestBpoSourcesByType(typeIds, {
      originals,
      contractRegionId: uiFilter.regionId,
      marketBooks: market.booksByType,
      hubStationId: marketHubStationId,
    });
  }, [
    marketLookup.typeIds,
    filteredRows,
    filteredOwnedRows,
    originals,
    uiFilter.regionId,
    market.booksByType,
    marketHubStationId,
  ]);
  const bpoByType = useMemo(() => {
    const result = new Map<number, BpoOffer>();
    for (const [typeId, sources] of bpoSourcesByType) {
      const best = cheaperBpo(sources);
      if (best) result.set(typeId, best);
    }
    return result;
  }, [bpoSourcesByType]);

  /**
   * Built from whichever source(s) are toggled on. Owned rows lead, then the
   * BPO sources: the synced contract snapshot can run to six figures while
   * the others number in the dozens, so copies-first would let them fill
   * `ROW_CAP` and push every other row out of the default (not-`showAll`) view.
   */
  const displayRows = useMemo<BpcSearchRow[]>(() => {
    const contractRows = sources.has('contract') ? contractSearchRows : [];
    const ownedRows = sources.has('owned') ? filteredOwnedRows : [];
    const marketRows = sources.has('market') ? marketSearchRows : [];
    const contractBpoRows = sources.has('contractBpo') ? contractBpoSearchRows : [];
    return [...ownedRows, ...marketRows, ...contractBpoRows, ...contractRows];
  }, [sources, contractSearchRows, filteredOwnedRows, marketSearchRows, contractBpoSearchRows]);
  const visibleRows = useMemo(
    () => (showAll ? displayRows : displayRows.slice(0, ROW_CAP)),
    [showAll, displayRows]
  );
  // With several blueprints listed, one on-screen copy row per type carries the BPO
  // badge; with one picked, the callout cards say it instead (issue #1241).
  const badgedRows = useMemo(
    () => (selectedTypeId === null ? bpoBadgeRows(visibleRows) : new Set<BpcSearchRow>()),
    [selectedTypeId, visibleRows]
  );

  // Both summarise `filteredRows`, not every row of the chosen blueprint, so
  // they describe what is actually on screen: narrowing to ME ≥ 10 should move
  // "cheapest" to the cheapest ME 10 copy, not keep quoting an ME 0 one the
  // table below no longer lists.
  const summary = useMemo(
    () => (selectedTypeId === null ? null : bpcPriceSummary(filteredRows)),
    [selectedTypeId, filteredRows]
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
  const regionPrices = useMemo(
    () => (selectedTypeId === null ? [] : cheapestByRegion(filteredRows)),
    [selectedTypeId, filteredRows]
  );
  // One accent for the whole row: the leading region cell, or a BPO card
  // only when it is strictly the cheapest box shown (region cells render
  // only when there are two or more regions).
  const cheapestCard = cheapestSourcingCard(
    regionPrices.length > 1 ? regionPrices[0].cheapest : null,
    selectedBpoCards
  );

  const bpcColumnsById = useMemo<Record<BpcSearchColumnId, DataTableColumn<BpcSearchRow>>>(
    () => ({
      source: {
        id: 'source',
        header: t('bpcContracts.sourceColumn'),
        sortValue: (row) => row.source,
        render: (row) => (
          <span className="inline-flex items-center rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
            {row.source === 'contract'
              ? t('bpcContracts.sourceContractSingular')
              : row.source === 'market'
                ? t('bpcContracts.sourceMarketSingular')
                : t('bpcContracts.sourceOwned')}
          </span>
        ),
      },
      location: {
        id: 'location',
        header: t('bpcContracts.locationColumn'),
        sortValue: (row) => row.locationName ?? '',
        render: (row) => {
          const name = row.locationName ?? t('bpcContracts.notApplicable');
          // The owner's #1240 rule for market BPOs: the whole region, the hub's own station marked.
          if (row.source !== 'market' || !row.atHub) return name;
          return (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <span>{name}</span>
              <span className="text-[0.625rem] tracking-widest text-accent uppercase">
                {t('bpcContracts.atTradeHub')}
              </span>
            </span>
          );
        },
      },
      me: {
        id: 'me',
        header: t('bpcContracts.meColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.me,
        render: (row) => row.me,
      },
      te: {
        id: 'te',
        header: t('bpcContracts.teColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.te,
        render: (row) => row.te,
      },
      runs: {
        id: 'runs',
        header: t('bpcContracts.runsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.runs,
        // A BPO's -1 renders as ∞, not a nonsensical negative count.
        render: (row) => (row.runs === -1 ? t('bpcContracts.unlimitedRuns') : row.runs),
      },
      qty: {
        id: 'qty',
        header: t('bpcContracts.qtyColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        render: (row) => row.quantity,
      },
      price: {
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
          if (row.source === 'market') return row.price;
          const contract = asContract(row);
          return contract ? effectivePrice(contract) : Infinity;
        },
        render: (row) => {
          if (row.source === 'market') return <IskAmount value={row.price} revealOn="longPress" />;
          const contract = asContract(row);
          if (!contract) return t('bpcContracts.notApplicable');
          // Only the plain ask becomes shorthand, so this column mixes
          // precisions: "5M" on an exchange row, "Buyout: 5,000,000.00" on an
          // auction one. An auction's figure is wrapped in
          // "Buyout: {{price}}" / "Starting bid: {{price}}" — an i18next
          // interpolation value, which takes a string, not a node, and
          // splitting the suffix off would need a new short key
          // (`contractSearch` has `buyoutShort`/`startingBidShort`;
          // `bpcContracts` does not). Sorting is unaffected: `sortValue`
          // reads `effectivePrice`. Long press, not tap: a row tap opens the
          // contract.
          const amount = contract.isAuction ? (
            contract.buyout !== undefined ? (
              t('bpcContracts.buyout', {
                price: formatIskAuto(contract.buyout, CONTRACT_ISK_CENTS_BELOW),
              })
            ) : (
              t('bpcContracts.startingBid', {
                price: formatIskAuto(contract.price, CONTRACT_ISK_CENTS_BELOW),
              })
            )
          ) : (
            <IskAmount value={contract.price} revealOn="longPress" />
          );
          // A multi-type contract's ask is real but indivisible (issue
          // #1076) — marked rather than attributed to this one blueprint;
          // the row itself already opens the contract detail, which prices
          // both sides of a bundle.
          if (!contract.isMultiType) return amount;
          return (
            <span className="flex flex-col items-start sm:items-end">
              <span>{amount}</span>
              <span className="text-[0.625rem] text-text-dim">
                {t('bpcContracts.wholeContractMarker')}
              </span>
            </span>
          );
        },
      },
      iskPerRun: {
        id: 'iskPerRun',
        header: t('bpcContracts.iskPerRunColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        // Same rule as the Courier board's ISK/jump: no rate sinks the row in
        // either direction, `undefined` rather than a sentinel that would lead
        // the table on one of them. An owned row has no asking price at all.
        sortValue: (row) => {
          const contract = asContract(row);
          if (!contract) return undefined;
          return (
            iskPerRun(
              effectivePrice(contract),
              contract.runs,
              contract.quantity,
              contract.isMultiType
            ) ?? undefined
          );
        },
        render: (row) => {
          const contract = asContract(row);
          if (!contract) return t('bpcContracts.notApplicable');
          const rate = iskPerRun(
            effectivePrice(contract),
            contract.runs,
            contract.quantity,
            contract.isMultiType
          );
          if (rate === null) return t('bpcContracts.notApplicable');
          return formatIskAuto(rate, CONTRACT_ISK_CENTS_BELOW);
        },
      },
      region: {
        id: 'region',
        header: t('bpcContracts.regionColumn'),
        // An owned row's `regionId` comes from its resolved location
        // (issue #796) rather than `contract.regionId` — before that
        // resolution existed this column had nothing to show an owned row at
        // all, which is the "—" the issue reported.
        sortValue: (row) => {
          const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
          return regionId == null ? '' : (regionNames.get(regionId) ?? `#${regionId}`);
        },
        render: (row) => {
          const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
          return regionId == null
            ? t('bpcContracts.notApplicable')
            : (regionNames.get(regionId) ?? `#${regionId}`);
        },
      },
      space: {
        id: 'space',
        header: t('bpcContracts.spaceColumn'),
        sortValue: (row) => row.space ?? '',
        render: (row) =>
          row.space ? t(`common.spaceOption.${row.space}`) : t('bpcContracts.notApplicable'),
      },
      expires: {
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
    }),
    [t, regionNames, timeZone]
  );

  const columns = useMemo<DataTableColumn<BpcSearchRow>[]>(() => {
    const cols: DataTableColumn<BpcSearchRow>[] = [
      {
        id: 'item',
        header: t('bpcContracts.itemColumn'),
        primary: true,
        sortValue: (row) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => {
          const name = blueprintNames.get(row.typeId) ?? `#${row.typeId}`;
          // A BPO row is the BPO itself; only a copy gets the "BPO too" badge,
          // and only one copy per type (`bpoBadgeRows`).
          const bpo = badgedRows.has(row) ? bpoByType.get(row.typeId) : undefined;
          if (!bpo) return name;
          return (
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span>{name}</span>
              <BpoBadge
                bpo={bpo}
                mayBeCheaper={row.source === 'contract' && bpoMayBeCheaper(bpo, row.contract)}
                locationName={bpoLocationName(bpo)}
                regionName={regionLabel(bpo.regionId)}
              />
            </span>
          );
        },
      },
    ];
    for (const id of BPC_SEARCH_COLUMN_IDS) {
      if (visibleColumns.includes(id)) cols.push(bpcColumnsById[id]);
    }
    return cols;
  }, [
    t,
    blueprintNames,
    visibleColumns,
    bpcColumnsById,
    bpoByType,
    badgedRows,
    bpoLocationName,
    regionLabel,
  ]);
  const sortProps = useUrlSort(
    BPC_SOURCING_SORT_KEY,
    OFFERS_DEFAULT_SORT,
    columns.map((column) => column.id)
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
        <>
          <ColumnPickerMenu
            available={BPC_SEARCH_COLUMN_IDS}
            visible={visibleColumns}
            columnsById={bpcColumnsById}
            onToggle={toggleColumn}
            buttonLabel={t('bpcContracts.columnsButton')}
            menuTitle={t('bpcContracts.columnsMenuTitle')}
          />
          <IconButton
            icon={<Icon.Refresh />}
            label={t('bpcContracts.refresh')}
            onClick={() => {
              refresh();
              setMarketRefreshTick((tick) => tick + 1);
            }}
            disabled={loading}
          />
        </>
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
      ) : rows.length === 0 && originals.length === 0 && ownedBlueprints.length === 0 ? (
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
          <BpcFilterBar
            filter={uiFilter}
            onChange={changeFilter}
            regionOptions={regionOptions}
            sources={sources}
            onSourcesChange={(next) => setParams({ 'sourcing.src': next })}
            spaceKinds={spaceFilter}
            onSpaceKindsChange={(next) => void setSpaceFilter(next)}
            jumps={jumps}
            onJumpsChange={(next) => setParams({ 'sourcing.jumps': next, 'sourcing.all': false })}
            currentSystem={currentSystem}
          />
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
                    value={<IskAmount value={summary.cheapest} revealOn="tap" />}
                  />
                )}
                {summary.median !== null && (
                  <StatChip
                    label={t('bpcContracts.medianLabel')}
                    value={<IskAmount value={summary.median} revealOn="tap" />}
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

          {(regionPrices.length > 1 || selectedBpoCards.length > 0) && (
            // One wrapping row: [Cheapest by region] [Market BPOs] [Contract BPOs],
            // every card the same width; groups stack on a phone. A group with
            // no card is left out.
            <div className="flex flex-col gap-3 border-b border-line px-3 py-2 sm:flex-row sm:flex-wrap sm:gap-x-4">
              {regionPrices.length > 1 && (
                <div className="min-w-0 max-w-full">
                  {/* Says so when it is showing a subset: the cheapest region always
                    survives the slice, but a blueprint listed in twenty regions
                    would otherwise show six with nothing admitting it. */}
                  <p className={SOURCING_GROUP_HEADER}>
                    {regionPrices.length > REGION_CELL_LIMIT
                      ? t('bpcContracts.cheapestByRegionCapped', {
                          shown: REGION_CELL_LIMIT,
                          total: regionPrices.length,
                        })
                      : t('bpcContracts.cheapestByRegion')}
                  </p>
                  {/* Cheapest first, so the ordering carries the answer and the
                    accent on the leading cell is only reinforcement (DESIGN.md §7). */}
                  <ul className="flex flex-wrap gap-2">
                    {regionPrices.slice(0, REGION_CELL_LIMIT).map((region, index) => (
                      <li
                        key={region.regionId}
                        className={cx(
                          'flex flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-2',
                          SOURCING_CARD_WIDTH,
                          index === 0 && cheapestCard === 'region'
                            ? 'border-accent-dim'
                            : 'border-line'
                        )}
                      >
                        <span className="truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                          {regionNames.get(region.regionId) ?? `#${region.regionId}`}
                        </span>
                        <span
                          className={cx(
                            'text-sm tabular-nums',
                            index === 0 && cheapestCard === 'region' && 'text-accent'
                          )}
                        >
                          <IskAmount value={region.cheapest} revealOn="tap" />
                        </span>
                        <span className="text-[0.6875rem] tabular-nums text-text-dim">
                          {t('bpcContracts.regionOffers', { count: region.offerCount })}
                        </span>
                      </li>
                    ))}
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
                        className={SOURCING_CARD_WIDTH}
                      />
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {(marketLookup.typeIds.length > 0 || sources.has('market')) && (
            <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
              {marketLookup.typeIds.length === 0 || marketRegionId === null
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
                    .join(' ')}
            </p>
          )}

          {sources.size === 0 ? (
            <EmptyState title={t('bpcContracts.noSourceSelected')} className="py-8" />
          ) : displayRows.length === 0 ? (
            <EmptyState
              title={t('bpcContracts.noFilterMatches')}
              hint={t('bpcContracts.noFilterMatchesHint')}
              className="py-8"
            />
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
                    : row.source === 'market'
                      ? `market:${row.orderId}`
                      : `owned:${row.itemId}`
                }
                {...sortProps}
                // No contract exists for an owned row — nothing to open.
                onRowClick={(row) => setOpenRow(asContract(row))}
                rowContextMenu={(row, tr) => (
                  // The Offer's own ME/TE/runs, not the defaults, so a pilot
                  // shopping a specific copy sees what *that* copy builds. A
                  // BPO's -1 runs falls back to the unseeded default instead
                  // of a fabricated run count.
                  <BuildPlanContextMenu
                    typeId={row.typeId}
                    itemName={blueprintNames.get(row.typeId)}
                    seed={row.runs === -1 ? null : { me: row.me, te: row.te, runs: row.runs }}
                    trigger={tr}
                  />
                )}
              />
              {!showAll && displayRows.length > ROW_CAP && (
                <div className="px-3 py-2">
                  <Button size="sm" onClick={() => setParams({ 'sourcing.all': true })}>
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
const EMPTY_CONTRACT_LOCATIONS: ReadonlyMap<number, ContractLocationInfo> = new Map();
const EMPTY_OWNED_LOCATIONS: ReadonlyMap<number, ResolvedLocation> = new Map();
