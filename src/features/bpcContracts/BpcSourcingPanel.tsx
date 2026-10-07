import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { marketLinkParams } from '@/engine/market/urlState';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  DataTableDenseCell,
  EmptyState,
  FilterBar,
  FilterChip,
  CheckboxSelect,
  FilterField,
  IconButton,
  IskAmount,
  IskInput,
  Panel,
  RegionSelect,
  SearchInput,
  Spinner,
  StatChip,
  StatChips,
  TextInput,
  sortRows,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useRememberedUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  bpcSourcingParams,
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
import { useLpBlueprintOffers } from '@/features/bpcContracts/useLpBlueprintOffers';
import { useLpValue } from '@/features/loyalty/lpValue';
import { useBpcSources } from '@/features/bpcContracts/bpcSourcesPref';
import { BpcContractModal } from '@/features/bpcContracts/BpcContractModal';
import { bpcSourcingCsvColumns } from '@/features/bpcContracts/bpcSourcingCsv';
import { HintText } from '@/components/ui/HintText';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
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
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
import { DEFAULT_JUMP_RANGE, withinJumpRange, type JumpRange } from '@/engine/route/jumpRange';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type CurrentSystemState,
  type JumpsCellValue,
} from '@/features/route/currentSystem';
import {
  CurrentSystemPicker,
  JumpRangeNote,
  JumpRangeSelect,
} from '@/features/route/JumpRangeControls';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadBlueprints } from '@/sde/loadSde';
import { isSyncConfigured } from '@/app/syncStatus';
import type { CachedResult } from '@/esi/cache';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import {
  bpcActiveFilterChips,
  bpcActiveFilterCount,
  type BpcFilterChip,
  type BpcFilterState,
  type BpcHideDefaults,
  type BpcSourcingFilter,
} from './bpcActiveFilters';
import { SecurityStatus } from '@/components/SecurityStatus';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useIsPhone } from '@/lib/useIsPhone';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { rankedSearch } from '@/lib/rankedSearch';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto, parseIskAmount } from '@/lib/isk';
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

type UiFilter = BpcSourcingFilter;

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

/**
 * Rows the table shows, taken from the top of the current sort. A broad
 * search can match six figures of synced contracts; past a couple of hundred
 * the answer is to narrow the search, not to scroll.
 */
const RESULT_LIMIT = 200;

/** Section header over each group in the sourcing strip: Cheapest by region, Market BPOs, Contract BPOs. */
const SOURCING_GROUP_HEADER =
  'pb-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * One card width for region and BPO cards alike from `sm`, so the groups
 * share a row. On a phone a region cell is narrower and the row scrolls
 * sideways rather than wrapping six cells into three rows above the offers.
 */
const REGION_CELL_WIDTH = 'w-28 shrink-0 sm:w-36';

/** A BPO card on a phone is one full-width line (price · system · detail), not a third half-width box. */
const BPO_CARD_LAYOUT =
  'w-full max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 sm:w-36';

/**
 * The Cheapest chip as the picked blueprint's headline on a phone: its own
 * line, label over a large figure, instead of one more 11px chip. CSS only,
 * so the same chip reads as the desktop strip's first chip from `sm` up.
 */
const CHEAPEST_HEADLINE_CHIP =
  'max-sm:h-auto max-sm:basis-full max-sm:flex-col max-sm:items-start max-sm:gap-0 max-sm:before:hidden max-sm:[&>span:last-child]:text-3xl max-sm:[&>span:last-child]:font-bold';

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

/**
 * "Set waypoint in game" for a row whose Location names its station or
 * structure; nothing for one that names none (an unresolved location, or an
 * owned blueprint inside a container or ship).
 */
function waypointItemFor(row: BpcSearchRow, ownedPlaceIds: ReadonlyMap<number, number>): ReactNode {
  if (row.locationName === null) return null;
  const placeId =
    row.source === 'contract'
      ? row.contract.locationId
      : row.source === 'market'
        ? row.locationId
        : row.source === 'owned'
          ? ownedPlaceIds.get(row.itemId)
          : undefined;
  return placeId === undefined ? null : (
    <SetWaypointMenuItem locationId={placeId} placeName={row.locationName} />
  );
}

/** The Trade Hub station in `regionId`, or 0 when the region holds none — nothing gets marked. */
function hubStationIn(regionId: number | null): number {
  return TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId ?? 0;
}

const OFFERS_DEFAULT_SORT = { columnId: 'price', direction: 'asc' } as const;

const SOURCE_LABEL_KEYS: Record<SourceToggle, string> = {
  contract: 'bpcContracts.sourceContracts',
  contractBpo: 'bpcContracts.sourceContractBpos',
  market: 'bpcContracts.sourceMarketBpos',
  lp: 'bpcContracts.sourceLpStore',
  owned: 'bpcContracts.sourceOwned',
};

const SOURCE_TOOLTIP_KEYS: Partial<Record<SourceToggle, string>> = {
  contractBpo: 'bpcContracts.sourceContractBposTooltip',
  market: 'bpcContracts.sourceMarketBposTooltip',
  lp: 'bpcContracts.sourceLpStoreTooltip',
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
  /** The pilot's own Exclude defaults (Settings): hiding at the default is not an active filter. */
  hideDefaults: BpcHideDefaults;
  /** The blueprint box's combobox wiring — role, expanded state, active option and arrow keys — owned by the panel, which renders the listbox. */
  searchComboboxProps: InputHTMLAttributes<HTMLInputElement>;
  /** The column picker, inline between the search box and the funnel. */
  actions?: ReactNode;
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
  hideDefaults,
  searchComboboxProps,
  actions,
}: BpcFilterBarProps) {
  const { t } = useTranslation();
  const activeCount = bpcActiveFilterCount({ filter, sources, spaceKinds, jumps }, hideDefaults);

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
      className="border-b border-line px-3 py-2"
      actions={actions}
      search={
        <SearchInput
          value={filter.typeQuery}
          onChange={(event) => onChange({ ...filter, typeQuery: event.target.value })}
          placeholder={t('bpcContracts.searchPlaceholder')}
          className="min-w-48 flex-1"
          {...searchComboboxProps}
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
            <IskInput
              aria-label={t('bpcContracts.maxPriceLabel')}
              placeholder={t('bpcContracts.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(maxPrice) => setDraft({ ...draft, maxPrice })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.excludeLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.excludeLabel')}
              className="w-44"
              options={[
                { value: 'auctions' as const, label: t('bpcContracts.hideAuctions') },
                {
                  value: 'plex' as const,
                  label: t('bpcContracts.hidePlex'),
                  description: t('bpcContracts.hidePlexTooltip'),
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
          <FilterField label={t('bpcContracts.sourceLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.sourceLabel')}
              className="w-44"
              options={SOURCE_TOGGLES.map((source) => ({
                value: source,
                label: t(SOURCE_LABEL_KEYS[source]),
                description: SOURCE_TOOLTIP_KEYS[source] && t(SOURCE_TOOLTIP_KEYS[source]),
              }))}
              selected={draft.sources}
              onToggle={(source) => {
                const next = new Set(draft.sources);
                if (next.has(source)) next.delete(source);
                else next.add(source);
                setDraft({ ...draft, sources: next });
              }}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.spaceLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.spaceLabel')}
              className="w-44"
              options={SPACE_KINDS.map((kind) => ({
                value: kind,
                label: t(`common.spaceOption.${kind}`),
              }))}
              selected={new Set(draft.spaceKinds)}
              onToggle={(kind) => {
                const next = draft.spaceKinds.includes(kind)
                  ? draft.spaceKinds.filter((existing) => existing !== kind)
                  : [...draft.spaceKinds, kind];
                setDraft({ ...draft, spaceKinds: next });
              }}
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

  // Search, filters, sources and the pinned blueprint all live in
  // the URL (`bpcSourcingUrl.ts`), one group so a handler that changes
  // several at once writes them in one navigation.
  const hideAuctionsDefault = useBpcHideAuctionsDefault((state) => state.value);
  const hidePlexDefault = useBpcHidePlexDefault((state) => state.value);
  const hydrateHideAuctionsDefault = useBpcHideAuctionsDefault((state) => state.hydrate);
  const hydrateHidePlexDefault = useBpcHidePlexDefault((state) => state.hydrate);
  useEffect(() => {
    void hydrateHideAuctionsDefault();
    void hydrateHidePlexDefault();
  }, [hydrateHideAuctionsDefault, hydrateHidePlexDefault]);
  const sourcingParams = useMemo(
    () => bpcSourcingParams({ hideAuctions: hideAuctionsDefault, hidePlex: hidePlexDefault }),
    [hideAuctionsDefault, hidePlexDefault]
  );
  // Source is a remembered default behind its URL key (`bpcSourcesPref.ts`):
  // a bare visit reopens the pilot's last picks, a link's `sourcing.src` still
  // wins, and only an edit is stored. Same group, so it writes in the same
  // navigation as the rest.
  const rememberedSources = useBpcSources((state) => state.value);
  const hydrateRememberedSources = useBpcSources((state) => state.hydrate);
  useEffect(() => {
    void hydrateRememberedSources();
  }, [hydrateRememberedSources]);
  const rememberedParams = useMemo(
    () => ({
      values: { 'sourcing.src': new Set(rememberedSources) },
      remember: (patch: { 'sourcing.src'?: ReadonlySet<SourceToggle> }) => {
        const next = patch['sourcing.src'];
        if (next !== undefined) {
          void useBpcSources.getState().setValue(SOURCE_TOGGLES.filter((s) => next.has(s)));
        }
      },
    }),
    [rememberedSources]
  );
  const [params, setParams] = useRememberedUrlParams(sourcingParams, rememberedParams);
  const uiFilter: UiFilter = useMemo(
    () => ({
      typeQuery: params['sourcing.q'],
      regionId: params['sourcing.region'],
      minMe: params['sourcing.minMe'],
      minTe: params['sourcing.minTe'],
      minRuns: params['sourcing.minRuns'],
      maxPrice: params['sourcing.maxPrice'],
      hideAuctions: params['sourcing.hideAuctions'],
      hidePlex: params['sourcing.hidePlex'],
    }),
    [params]
  );
  const sources = params['sourcing.src'];
  const jumps = params['sourcing.jumps'];
  const currentSystem = useCurrentSystem();
  const jumpFilter = useJumpRangeFilter(currentSystem, jumps);
  // Names each row's system on the phone card (the Location cell).
  const solarSystems = useSolarSystemIndex();
  const bpcRowJumps = useCallback(
    (row: BpcSearchRow): JumpsCellValue => {
      if (row.systemId === null) return { kind: 'value', count: null };
      if (jumpFilter.jumpsStatus !== 'ready') return { kind: jumpFilter.jumpsStatus };
      return { kind: 'value', count: jumpFilter.jumps?.get(row.systemId) ?? null };
    },
    [jumpFilter]
  );
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
  const navigate = useNavigate();
  const location = useLocation();

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
      maxPrice: uiFilter.maxPrice.trim() === '' ? null : parseIskAmount(uiFilter.maxPrice),
      spaceKinds: activeSpaceKinds,
      allowedSystems: jumpFilter.allowed,
      hideAuctions: uiFilter.hideAuctions,
      hidePlexRequests: uiFilter.hidePlex,
    }),
    [
      uiFilter.regionId,
      uiFilter.minMe,
      uiFilter.minTe,
      uiFilter.minRuns,
      uiFilter.maxPrice,
      uiFilter.hideAuctions,
      uiFilter.hidePlex,
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
        return t('bpcContracts.chips.sources', {
          list: chip.value.map((source) => t(SOURCE_LABEL_KEYS[source])).join(', '),
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

  const lpValue = useLpValue((state) => state.value);
  const lpValueHydrated = useLpValue((state) => state.hydrated);
  const hydrateLpValue = useLpValue((state) => state.hydrate);
  useEffect(() => {
    void hydrateLpValue();
  }, [hydrateLpValue]);
  const blueprintTypeIds = useMemo(() => [...blueprintNames.keys()], [blueprintNames]);
  const lpOffers = useLpBlueprintOffers({
    characterId: activeCharacterId,
    // Wait for the pilot's LP Value, or the offers price at the market rate and then reload.
    enabled: sources.has('lp') && lpValueHydrated,
    blueprintTypeIds,
    hub: marketHub,
    lpValue,
  });
  // The loaded offers cover every blueprint; the search narrows them here.
  const lpSearchRows = useMemo(() => {
    const searched =
      selectedTypeId !== null || uiFilter.typeQuery.trim() !== ''
        ? new Set(marketLookup.typeIds)
        : null;
    return filterBpcSearchRows(
      searched ? lpOffers.rows.filter((row) => searched.has(row.typeId)) : lpOffers.rows,
      nonTypeFilter
    );
  }, [lpOffers.rows, selectedTypeId, uiFilter.typeQuery, marketLookup.typeIds, nonTypeFilter]);

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
   * BPO sources, ahead of the synced contract snapshot — which can run to six
   * figures while the others number in the dozens.
   */
  const displayRows = useMemo<BpcSearchRow[]>(() => {
    const contractRows = sources.has('contract') ? contractSearchRows : [];
    const ownedRows = sources.has('owned') ? filteredOwnedRows : [];
    const marketRows = sources.has('market') ? marketSearchRows : [];
    const contractBpoRows = sources.has('contractBpo') ? contractBpoSearchRows : [];
    const lpRows = sources.has('lp') ? lpSearchRows : [];
    return [...ownedRows, ...marketRows, ...contractBpoRows, ...lpRows, ...contractRows];
  }, [
    sources,
    contractSearchRows,
    filteredOwnedRows,
    marketSearchRows,
    contractBpoSearchRows,
    lpSearchRows,
  ]);

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

  const blueprintPicked = selectedTypeId !== null;
  const isPhone = useIsPhone();
  const bpcColumnsById = useMemo<Record<BpcSearchColumnId, DataTableColumn<BpcSearchRow>>>(
    () => ({
      source: {
        id: 'source',
        header: t('bpcContracts.sourceColumn'),
        sortValue: (row) => row.source,
        render: (row) => (
          <span className="inline-flex items-center text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {row.source === 'contract'
              ? t('bpcContracts.sourceContractSingular')
              : row.source === 'market'
                ? t('bpcContracts.sourceMarketSingular')
                : row.source === 'lp'
                  ? t('bpcContracts.sourceLpStoreSingular')
                  : t('bpcContracts.sourceOwned')}
          </span>
        ),
      },
      location: {
        id: 'location',
        header: t('bpcContracts.locationColumn'),
        sortValue: (row) => (row.source === 'lp' ? row.corpName : (row.locationName ?? '')),
        render: (row) => {
          // An LP offer has no station here: the store's corporation is its place.
          const name =
            row.source === 'lp'
              ? row.corpName
              : (row.locationName ?? t('bpcContracts.notApplicable'));
          // The station's security after its name, the figure a buyer weighs
          // a trip by. On the phone card's meta line a fifty-character
          // station name is cut short — it opens with its system's name, so
          // "Jita IV - Moon 4 -…" still says where.
          const system = row.systemId == null ? undefined : solarSystems?.get(row.systemId);
          const place = (
            <>
              <span className="max-sm:inline-block max-sm:max-w-36 max-sm:truncate max-sm:align-bottom">
                {name}
              </span>
              {system && <SecurityStatus security={system.security} />}
            </>
          );
          // The owner's #1240 rule for market BPOs: the whole region, the hub's own station marked.
          if (row.source !== 'market' || !row.atHub)
            return <DataTableDenseCell>{place}</DataTableDenseCell>;
          return (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              {place}
              <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('bpcContracts.atTradeHub')}
              </span>
            </span>
          );
        },
      },
      jumps: {
        // A row's own distance from the Current System, independent of
        // whether the Jump Range filter above is even active
        // (`jumpFilter.jumps`/`jumpsStatus` are populated at every range,
        // `useJumpRangeFilter`). A row with no resolved system at all (still
        // loading, or ESI never placed it) sinks to a settled `null` — the
        // filter's own status has nothing to say about a row it never saw.
        id: 'jumps',
        header: t('bpcContracts.jumpsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => {
          const cell = bpcRowJumps(row);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        // The dense phone card has no header row, and a bare "7" beside a
        // system name says nothing about what it counts.
        stackAffix: { before: t('bpcContracts.mobile.jumpsAffix') },
        render: (row) =>
          renderJumpsCell(bpcRowJumps(row), t, 'bpcContracts.jumpsUnavailableHint', row.systemId),
      },
      me: {
        id: 'me',
        header: t('bpcContracts.meColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.me,
        stackAffix: { before: t('bpcContracts.mobile.meAffix') },
        // Full text, not the meta line's dim: on the phone card the copy's
        // quality is what a buyer reads after its price.
        render: (row) => <QualityValue omitOnCard={blueprintPicked}>{row.me}</QualityValue>,
      },
      te: {
        id: 'te',
        header: t('bpcContracts.teColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.te,
        stackAffix: { before: t('bpcContracts.mobile.teAffix') },
        render: (row) => <QualityValue omitOnCard={blueprintPicked}>{row.te}</QualityValue>,
      },
      runs: {
        id: 'runs',
        header: t('bpcContracts.runsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.runs ?? undefined,
        stackAffix: { after: t('bpcContracts.mobile.runsAffix') },
        // A BPO's -1 renders as ∞, not a nonsensical negative count.
        render: (row) => (
          <QualityValue omitOnCard={blueprintPicked}>
            {row.runs === null
              ? t('bpcContracts.notApplicable')
              : row.runs === -1
                ? t('bpcContracts.unlimitedRuns')
                : row.runs}
          </QualityValue>
        ),
      },
      qty: {
        id: 'qty',
        header: t('bpcContracts.qtyColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        stackAffix: { before: t('bpcContracts.mobile.qtyAffix') },
        render: (row) => row.quantity,
      },
      price: {
        id: 'price',
        header: t('bpcContracts.priceColumn'),
        align: 'right',
        // The headline figure of the dense phone card, on the title line.
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        // `effectivePrice`, not the `buyout ?? price` this used to inline: EVE
        // Ref's CSV carries a buyout on non-auction contracts too whenever the
        // field parses, so an item_exchange row with `buyout: 0` sorted to the
        // top of the table while rendering — and now summarising — at its real
        // price. Owned rows sort last (Infinity) rather than reading as cheapest.
        sortValue: (row) => {
          if (row.source === 'market' || row.source === 'lp') return row.price;
          const contract = asContract(row);
          if (!contract) return Infinity;
          // A PLEX-for-item barter's real ask isn't ISK at all (issue #1105)
          // — sorting it at its `0` ISK price would put it above every real
          // priced offer as "cheapest", which it isn't. Sorts last, the same
          // stance an owned row (no price to judge) already takes.
          if (contract.requestedPlex) return Infinity;
          return effectivePrice(contract);
        },
        render: (row) => {
          if (row.source === 'market') return <IskAmount value={row.price} />;
          if (row.source === 'lp') {
            return (
              <HintText
                desktopOnly
                content={t('bpcContracts.lpOfferCost', {
                  isk: row.iskCost.toLocaleString(),
                  lp: row.lpCost.toLocaleString(),
                })}
              >
                <IskAmount value={row.price} />
              </HintText>
            );
          }
          const contract = asContract(row);
          if (!contract) return t('bpcContracts.notApplicable');
          // An auction's figure carries a short "buyout"/"bid" tag after
          // it, Contract Search's own, rather than "Starting bid: 12,000,000"
          // — too wide for the phone card's headline corner, and the number
          // alone would read as a fixed ask. Sorting is unaffected:
          // `sortValue` reads `effectivePrice`. Long press, not tap: a row
          // tap opens the contract.
          //
          // A contract asking for PLEX (issue #1105) usually has an ISK
          // `price` of `0` — the ask is the PLEX, not a real zero — so its
          // requested quantity is shown here instead of the ISK figure
          // `sortValue` would otherwise reflect as "free". Some issuers ask
          // for both an ISK amount and PLEX in the same contract, so a real
          // (non-zero) price alongside `requestedPlex` is shown as both
          // figures rather than the PLEX one alone hiding the ISK ask.
          const amount = contract.requestedPlex ? (
            contract.price > 0 ? (
              t('bpcContracts.iskPlusPlexPrice', {
                isk: formatIskAuto(contract.price, CONTRACT_ISK_CENTS_BELOW),
                plex: contract.requestedPlex.toLocaleString(),
              })
            ) : (
              t('bpcContracts.plexPrice', { plex: contract.requestedPlex.toLocaleString() })
            )
          ) : contract.isAuction ? (
            <>
              <IskAmount value={contract.buyout ?? contract.price} />
              <span className="ml-1 text-[0.6875rem] font-normal text-text-dim uppercase">
                {contract.buyout !== undefined
                  ? t('contractSearch.buyoutShort')
                  : t('contractSearch.startingBidShort')}
              </span>
            </>
          ) : (
            <IskAmount value={contract.price} />
          );
          // A multi-type contract's ask is real but indivisible (issue
          // #1076) — marked rather than attributed to this one blueprint;
          // the row itself already opens the contract detail, which prices
          // both sides of a bundle.
          if (!contract.isMultiType) return amount;
          return (
            // Right-hugging at every width: on the phone card the price is
            // the title line's right-hand figure, not a labelled field.
            <span className="flex flex-col items-end">
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
        stackAffix: { after: t('bpcContracts.mobile.perRunAffix') },
        render: (row) => {
          const contract = asContract(row);
          if (!contract) return <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>;
          const rate = iskPerRun(
            effectivePrice(contract),
            contract.runs,
            contract.quantity,
            contract.isMultiType
          );
          if (rate === null) return <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>;
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
        stackAffix: { before: t('bpcContracts.mobile.expiresAffix') },
        render: (row) => {
          const contract = asContract(row);
          return contract ? (
            formatTimestamp(new Date(contract.dateExpired), timeZone)
          ) : (
            <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>
          );
        },
      },
    }),
    [t, regionNames, timeZone, bpcRowJumps, solarSystems, blueprintPicked]
  );

  const itemSortValue = useCallback(
    (row: BpcSearchRow) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
    [blueprintNames]
  );
  // In table order. Shared by `columns` below and the sort, which is resolved
  // before `columns` exists: the cap sorts first, and the badges the Item
  // column renders are picked from what it keeps.
  const shownColumnIds = useMemo(
    () => BPC_SEARCH_COLUMN_IDS.filter((id) => visibleColumns.includes(id)),
    [visibleColumns]
  );
  const sortColumnIds = useMemo(() => ['item', ...shownColumnIds], [shownColumnIds]);
  const sortProps = useUrlSort(BPC_SOURCING_SORT_KEY, OFFERS_DEFAULT_SORT, sortColumnIds);
  // The top `RESULT_LIMIT` rows by the table's own sort (`sortRows` is the
  // rule `DataTable` sorts with), so the cap keeps the cheapest copies under
  // the default Price sort, the nearest under Jumps, and so on.
  const shownRows = useMemo(() => {
    const { columnId, direction } = sortProps.sort;
    const column =
      columnId === 'item'
        ? { sortValue: itemSortValue }
        : bpcColumnsById[columnId as BpcSearchColumnId];
    const sorted = column ? sortRows(displayRows, column, direction) : displayRows;
    return sorted.slice(0, RESULT_LIMIT);
  }, [displayRows, sortProps.sort, itemSortValue, bpcColumnsById]);
  // With several blueprints listed, one copy row per type carries the BPO
  // badge; with one picked, the callout cards say it instead (issue #1241).
  // Picked from the shown rows, so the cap never drops a type's only badge.
  const badgedRows = useMemo(
    () => (selectedTypeId === null ? bpoBadgeRows(shownRows) : new Set<BpcSearchRow>()),
    [selectedTypeId, shownRows]
  );

  const columns = useMemo<DataTableColumn<BpcSearchRow>[]>(() => {
    const cols: DataTableColumn<BpcSearchRow>[] = [
      {
        id: 'item',
        header: t('bpcContracts.itemColumn'),
        primary: true,
        sortValue: itemSortValue,
        render: (row) => {
          const name = blueprintNames.get(row.typeId) ?? `#${row.typeId}`;
          // A BPO row is the BPO itself; only a copy gets the "BPO too" badge,
          // and only one copy per type (`bpoBadgeRows`).
          const bpo = badgedRows.has(row) ? bpoByType.get(row.typeId) : undefined;
          // An owned copy has no price column to mark it apart from a for-sale
          // one, so the Item cell carries the tag instead — independent of
          // which columns are visible.
          const owned = row.source === 'owned';
          // One blueprint picked: every phone card would repeat its name, so
          // the card's title is the copy's quality instead, and ME/TE/runs
          // leave the meta line under it (`QualityValue`). The table keeps
          // the name.
          // Decided in JS (`useIsPhone`, the line `DataTable` stacks at), not
          // a CSS pair, so the cell holds one title at any width.
          const title =
            blueprintPicked && isPhone ? (
              <span className="tabular-nums">
                {t('bpcContracts.mobile.copyQuality', {
                  me: row.me,
                  te: row.te,
                  runs: row.runs === -1 ? t('bpcContracts.unlimitedRuns') : row.runs,
                })}
              </span>
            ) : (
              // Ellipsised on the phone card, so a long name stops short of the
              // price beside it instead of running under it.
              // Plain text: the row opens the contract modal (which lists the
              // item with its Market link) or, for a market row, the item's
              // Market entry (DESIGN.md §6c, a row's primary action beats
              // name links inside it).
              <span className={entityLinkClassName('max-sm:block max-sm:truncate')}>{name}</span>
            );
          if (!bpo && !owned) return title;
          return (
            // One wrapping line on the phone card, so a tag sits beside the
            // name rather than pushing the title line into three.
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-col sm:flex-nowrap sm:items-start sm:gap-1">
              <span className="min-w-0 max-w-full">{title}</span>
              {owned && (
                <span className="inline-flex w-fit items-center text-[0.6875rem] font-normal text-text-dim">
                  {t('bpcContracts.sourceOwned')}
                </span>
              )}
              {bpo && (
                <BpoBadge
                  bpo={bpo}
                  mayBeCheaper={row.source === 'contract' && bpoMayBeCheaper(bpo, row.contract)}
                  locationName={bpoLocationName(bpo)}
                  regionName={regionLabel(bpo.regionId)}
                />
              )}
            </span>
          );
        },
      },
    ];
    for (const id of shownColumnIds) cols.push(bpcColumnsById[id]);
    return cols;
  }, [
    t,
    blueprintNames,
    itemSortValue,
    shownColumnIds,
    bpcColumnsById,
    bpoByType,
    badgedRows,
    bpoLocationName,
    regionLabel,
    blueprintPicked,
    isPhone,
  ]);
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
        <span className="flex items-center gap-2">
          {displayRows.length > 0 && (
            <TableActionsMenu name={t('bpcContracts.title')} tableExport={sourcingExport} />
          )}
          <IconButton
            icon={<Icon.Refresh />}
            label={t('bpcContracts.refresh')}
            size="sm"
            onClick={() => {
              refresh();
              setMarketRefreshTick((tick) => tick + 1);
            }}
            disabled={loading}
          />
        </span>
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
              <ColumnPickerMenu
                available={BPC_SEARCH_COLUMN_IDS}
                visible={visibleColumns}
                columnsById={bpcColumnsById}
                onToggle={toggleColumn}
                buttonLabel={t('bpcContracts.columnsButton')}
                menuTitle={t('bpcContracts.columnsMenuTitle')}
              />
            }
          />
          {activeChips.length > 0 && (
            // Phone only: from `md` up every filter sits inline in the bar
            // above, so it already shows what it is set to. Below it they
            // hide in the funnel's sheet, where a count badge was the only
            // sign any was on.
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 md:hidden">
              {activeChips.map((chip) => (
                <FilterChip
                  key={chip.id}
                  label={filterChipLabel(chip)}
                  selected
                  onToggle={() => applyFilterState(chip.clear(filterState))}
                />
              ))}
              <button
                type="button"
                className={textActionClassName()}
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
              <p className="pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
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
                      suggestion === highlightedSuggestion ? 'bg-panel-2' : 'hover:bg-panel-2'
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
              <div className="min-w-0 max-sm:w-full">
                <p className="truncate text-base font-semibold">{selectedName}</p>
                {/* The phone's sort bar counts the offers instead. */}
                <p className="text-[0.6875rem] text-text-dim max-sm:hidden">
                  {t('bpcContracts.offersOnContract', { count: summary.offerCount })}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2 max-sm:w-full sm:items-center md:ml-auto">
                <StatChips className="max-sm:flex-1">
                  {summary.cheapest !== null && (
                    <StatChip
                      className={CHEAPEST_HEADLINE_CHIP}
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
            // every card the same width; groups stack on a phone, where the
            // region cells scroll sideways and a BPO is one line. A group
            // with no card is left out.
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
                  {/* `relative` makes the row the containing block of each
                    price's absolutely positioned screen-reader text
                    (`IskAmount`'s `sr-only`). Without it that text escaped
                    the row's scroll clip and the whole page scrolled
                    sideways on a phone, not just this row. */}
                  <ul
                    aria-label={t('bpcContracts.cheapestByRegion')}
                    className="relative flex gap-2 max-sm:-mx-3 max-sm:overflow-x-auto max-sm:px-3 sm:flex-wrap"
                  >
                    {regionPrices.slice(0, REGION_CELL_LIMIT).map((region, index) => (
                      <li
                        key={region.regionId}
                        className={cx(
                          'flex flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-2',
                          REGION_CELL_WIDTH,
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
                          <IskAmount value={region.cheapest} />
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
                        className={BPO_CARD_LAYOUT}
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
              action={
                <Button size="sm" onClick={resetSourcingFilters}>
                  {t('common.resetFilters')}
                </Button>
              }
            />
          ) : (
            <>
              {displayRows.length > shownRows.length && (
                // The phone's sort bar says it instead (`stackSummary` below).
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim max-sm:hidden">
                  {t('bpcContracts.resultsCapped', {
                    shown: shownRows.length.toLocaleString(),
                    total: displayRows.length.toLocaleString(),
                  })}
                </p>
              )}
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
                        shown: shownRows.length.toLocaleString(),
                        total: displayRows.length.toLocaleString(),
                      })
                    : t('bpcContracts.mobile.offerCount', { count: displayRows.length })
                }
                // A contract row opens its contract; a market row opens the
                // item's Market entry. No contract exists for an owned row —
                // nothing to open.
                onRowClick={(row) => {
                  if (row.source === 'lp') {
                    // The store, with this offer picked; `affordableOnly=0` so an
                    // offer the pilot can't yet afford is not filtered out of view.
                    navigate(
                      `/market/lp-store/${row.corporationId}?${new URLSearchParams({ offer: String(row.offerId), affordableOnly: '0' })}`
                    );
                    return;
                  }
                  if (row.source === 'market') {
                    const params = marketLinkParams(row.typeId, location.search);
                    navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
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

/**
 * ME, TE or runs: full text on the phone card's dim meta line, since the
 * copy's quality is what a buyer reads after its price — or left off that
 * line entirely when one blueprint is picked and the card's title already
 * says it.
 */
function QualityValue({ omitOnCard, children }: { omitOnCard: boolean; children: ReactNode }) {
  return (
    <span className="max-sm:text-text" data-dense-omit={omitOnCard ? '' : undefined}>
      {children}
    </span>
  );
}

/** A "—" the dense phone card drops from its meta line rather than printing as one more `·` field. */
function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}

/** Stable identity, so a missing snapshot doesn't invalidate memoized columns/options every render. */
const EMPTY_MAP: ReadonlyMap<number, string> = new Map();
const EMPTY_OWNED_BLUEPRINTS: CharacterBlueprint[] = [];
const EMPTY_CONTRACT_LOCATIONS: ReadonlyMap<number, ContractLocationInfo> = new Map();
const EMPTY_OWNED_LOCATIONS: ReadonlyMap<number, ResolvedLocation> = new Map();
