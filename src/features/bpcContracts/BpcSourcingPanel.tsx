import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { marketLinkParams } from '@/engine/market/urlState';
import { industryTabHref } from '@/features/industry/industryTabs';
import { loadPlannableIndex, plannableProductTypeID } from '@/features/industry/plannableProduct';
import { applyPlanSeed } from '@/features/industry/planSeed';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  DataTableDenseCell,
  EmptyState,
  LiveStatus,
  LoadFailedState,
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
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { useRememberedUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  bpcSourcingParams,
  BPC_SOURCING_SORT_KEY,
  DEFAULT_SOURCE_TOGGLES,
  SOURCE_TOGGLES,
  sourceToggleKey,
  sourceToggleSet,
  type SourceToggle,
} from './bpcSourcingUrl';
import {
  asContract,
  cheapestByRegion,
  effectivePrice,
  iskPerRun,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import {
  loadPublicBpcContracts,
  type PublicBpcContractsSnapshot,
} from '@/features/bpcContracts/syncedContracts';
import { CommunityOfferCell } from '@/features/bpcContracts/CommunityOfferCell';
import { AskToCopyDialog } from '@/features/communities/AskToCopyDialog';
import { canAskToCopy } from '@/engine/communities/askToCopy';
import { bpcOfferRows } from '@/features/bpcContracts/bpcOfferRows';
import {
  bpcMarketLookup,
  prepareBpcOffers,
  rankBpcOffers,
  type BlueprintSuggestion,
  type BpcPrepareInput,
  type BpcQuery,
  type BpcSourceData,
} from '@/features/bpcContracts/searchBpcOffers';
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
import { useCommunityBlueprintOffers } from '@/features/bpcContracts/useCommunityBlueprintOffers';
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
  cheapestComparableCopy,
  cheapestSourcingCard,
  MARKET_BPO_LOOKUP_LIMIT,
  type BpoOffer,
} from '@/features/bpcContracts/bpoAvailability';
import { useMarketBpoOrders } from '@/features/bpcContracts/useMarketBpoOrders';
import { useMarketHub } from '@/features/market/hub';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
import { baselineRegions, nearestHub } from '@/engine/contracts/baselineRegions';
import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
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
import { jumpsCellSortValue, renderJumpsCell } from '@/features/route/jumpsCell';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadBlueprints } from '@/sde/loadSde';
import { isSyncConfigured } from '@/app/syncStatus';
import type { CachedResult } from '@/esi/cache';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { useRetryFocus } from '@/lib/useRetryFocus';
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
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

interface Snapshot {
  contractsResult: CachedResult<PublicBpcContractsSnapshot> | null;
  syncConfigured: boolean;
  blueprintNames: Map<number, string>;
  /** Reaction formulas: they cannot be copied, so never "ask to copy" (GLOSSARY Community Offer). */
  reactionFormulaTypeIds: ReadonlySet<number> | null;
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
      reactionFormulaTypeIds: null,
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

  const reactionFormulaTypeIds = new Set(
    Object.entries(blueprintMap)
      .filter(([, bp]) => bp.activity === 'reaction')
      .map(([typeId]) => Number(typeId))
  );

  // Already superseded: skip the region-name fan-out, its result would be discarded.
  // Originals ride along (issue #1241): the Contract BPOs source and the BPO
  // badge name their region and station too.
  const rows = contractsResult?.data ? bpcOfferRows(contractsResult.data) : [];
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
    reactionFormulaTypeIds,
    regionNames,
    ownedBlueprints,
    contractLocations,
    ownedLocations,
  };
}

type UiFilter = BpcSourcingFilter;

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
const REGION_CELL_WIDTH = 'w-28 shrink-0 sm:w-32';

/** A BPO card keeps the region cell's three lines; on a phone the Market and Contract groups share a two-column row instead of one full-width line each. */
const BPO_CARD_LAYOUT = 'w-full sm:w-32';

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
  const waypoint = waypointOnlyItemFor(row, ownedPlaceIds);
  // A contract row also opens its window in the EVE client.
  if (row.source !== 'contract') return waypoint;
  return (
    <>
      {waypoint}
      <OpenInEveMenuItem kind="contract" id={row.contract.contractId} />
    </>
  );
}

function waypointOnlyItemFor(
  row: BpcSearchRow,
  ownedPlaceIds: ReadonlyMap<number, number>
): ReactNode {
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
    <>
      <SetWaypointMenuItem locationId={placeId} placeName={row.locationName} />
      <OpenInEveMenuItem kind="information" id={placeId} />
    </>
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
  community: 'bpcContracts.sourceCommunity',
  owned: 'bpcContracts.sourceOwned',
};

const SOURCE_TOOLTIP_KEYS: Partial<Record<SourceToggle, string>> = {
  contractBpo: 'bpcContracts.sourceContractBposTooltip',
  market: 'bpcContracts.sourceMarketBposTooltip',
  lp: 'bpcContracts.sourceLpStoreTooltip',
  community: 'bpcContracts.sourceCommunityTooltip',
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
          className="min-w-32 flex-1 sm:min-w-48"
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
 * data — this one is global and Firestore-backed, Industry's is per-character
 * and ESI-backed.
 */
export function BpcSourcingPanel({
  onHeaderChange,
}: {
  onHeaderChange?: (state: BpcSourcingHeaderState | null) => void;
} = {}) {
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
  const reactionFormulaTypeIds = data?.reactionFormulaTypeIds ?? null;
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
  // The Community Offer whose "ask to copy…" dialog is open.
  const [askRow, setAskRow] = useState<Extract<BpcSearchRow, { source: 'community' }> | null>(null);
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
  // Refresh lives in the page header, not in this panel: it re-reads the
  // contract snapshot and re-checks the market. A ref keeps the callback the
  // header holds stable while `refresh` changes identity.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const refreshAll = useCallback(() => {
    refreshRef.current();
    setMarketRefreshTick((tick) => tick + 1);
  }, []);
  // Retry can unmount into the spinner: focus waits on the always-mounted card wrapper.
  const [cardRef, , holdRetryFocus] = useRetryFocus(
    loading
      ? 'busy'
      : error || (syncConfigured && contractsResult === null && ownedBlueprints.length === 0)
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

  /** `null` when every kind is checked — the filter's own default, a no-op. */
  const activeSpaceKinds = useMemo(
    () => (spaceFilter.length === SPACE_KINDS.length ? null : new Set(spaceFilter)),
    [spaceFilter]
  );

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

  const marketLookup = useMemo(
    () => bpcMarketLookup(selectedTypeId, uiFilter.typeQuery, allBlueprintOptions),
    [selectedTypeId, uiFilter.typeQuery, allBlueprintOptions]
  );
  const marketRegionId = useMemo(
    () => marketLookupRegion(uiFilter.regionId, marketHubHydrated, marketHub.regionId),
    [uiFilter.regionId, marketHubHydrated, marketHub.regionId]
  );
  const marketHubStationId = useMemo(() => hubStationIn(marketRegionId), [marketRegionId]);
  const market = useMarketBpoOrders(marketRegionId, marketLookup.typeIds, marketRefreshTick);

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
  const communityOffers = useCommunityBlueprintOffers({
    characterId: activeCharacterId,
    enabled: sources.has('community'),
  });

  const sourceData = useMemo<BpcSourceData>(
    () => ({
      contractRows: rows,
      originals,
      contractLocations,
      blueprintNames,
      ownedBlueprints,
      ownedLocations,
      marketBooksByType: market.booksByType,
      marketLocations: market.locations,
      marketRegionId,
      marketHubStationId,
      marketTypeIds: marketLookup.typeIds,
      lpRows: lpOffers.rows,
      communityRows: communityOffers.rows,
    }),
    [
      rows,
      originals,
      contractLocations,
      blueprintNames,
      ownedBlueprints,
      ownedLocations,
      market.booksByType,
      market.locations,
      marketRegionId,
      marketHubStationId,
      marketLookup.typeIds,
      lpOffers.rows,
      communityOffers.rows,
    ]
  );
  const query = useMemo<BpcQuery>(
    () => ({
      filter: uiFilter,
      selectedTypeId,
      sources,
    }),
    [uiFilter, selectedTypeId, sources]
  );
  // Stage 1 never reads the type query, so a keystroke reruns only stage 2.
  const stableFilter = useMemo<BpcPrepareInput['filter']>(
    () => ({
      regionId: uiFilter.regionId,
      minMe: uiFilter.minMe,
      minTe: uiFilter.minTe,
      minRuns: uiFilter.minRuns,
      maxPrice: uiFilter.maxPrice,
      hideAuctions: uiFilter.hideAuctions,
      hidePlex: uiFilter.hidePlex,
    }),
    [
      uiFilter.regionId,
      uiFilter.minMe,
      uiFilter.minTe,
      uiFilter.minRuns,
      uiFilter.maxPrice,
      uiFilter.hideAuctions,
      uiFilter.hidePlex,
    ]
  );
  // The URL parse returns a new Set on every write; key on content so a
  // keystroke's `sourcing.q` write doesn't rerun stage 1.
  const sourcesKey = sourceToggleKey(sources);
  const stableSources = useMemo(() => sourceToggleSet(sourcesKey), [sourcesKey]);
  // Deferred so a filter edit doesn't block input while the full snapshot reruns.
  const deferredStableFilter = useDeferredValue(stableFilter);
  const deferredQuery = useDeferredValue(query);
  const prepared = useMemo(
    () =>
      prepareBpcOffers(
        {
          contractRows: rows,
          originals,
          contractLocations,
          blueprintNames,
          ownedBlueprints,
          communityRows: communityOffers.rows,
        },
        {
          filter: deferredStableFilter,
          sources: stableSources,
          spaceKinds: activeSpaceKinds,
          allowedSystems: jumpFilter.allowed,
        }
      ),
    [
      rows,
      originals,
      contractLocations,
      blueprintNames,
      ownedBlueprints,
      communityOffers.rows,
      deferredStableFilter,
      stableSources,
      activeSpaceKinds,
      jumpFilter.allowed,
    ]
  );
  const { suggestions, filteredRows, bpoSourcesByType, bpoByType, displayRows, summary } = useMemo(
    () => rankBpcOffers(prepared, sourceData, deferredQuery),
    [prepared, sourceData, deferredQuery]
  );

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
                  : row.source === 'community'
                    ? t('bpcContracts.sourceCommunitySingular')
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
        sortValue: (row) => jumpsCellSortValue(bpcRowJumps(row)),
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
        // price. An owned row costs nothing, so it sorts at 0 beside Community
        // rows: sorted last it fell past the result cap and never showed.
        sortValue: (row) => {
          if (row.source === 'market' || row.source === 'lp' || row.source === 'community') {
            return row.price;
          }
          const contract = asContract(row);
          if (!contract) return 0;
          // A PLEX-for-item barter's real ask isn't ISK at all (issue #1105)
          // — sorting it at its `0` ISK price would put it above every real
          // priced offer as "cheapest", which it isn't. Sorts last, unlike an
          // owned or Community row, whose free price is real.
          if (contract.requestedPlex) return Infinity;
          return effectivePrice(contract);
        },
        render: (row) => {
          if (row.source === 'market' || row.source === 'community') {
            return <IskAmount value={row.price} />;
          }
          if (row.source === 'owned') return <IskAmount value={0} />;
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
        // Infinity sorts an owned row last, rather than epoch 0 reading as
        // "expires soonest."
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
  // the default Price sort, the nearest under Jumps, and so on. The sort is
  // stable, so ties keep `displayRows`' source order (the hidden secondary
  // sort, `rankBpcOffers`); `DataTable`'s own re-sort preserves it too.
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
          if (row.source === 'community') {
            return (
              <CommunityOfferCell
                row={row}
                title={title}
                canAsk={canAskToCopy(row, reactionFormulaTypeIds)}
                onAsk={() => setAskRow(row)}
              />
            );
          }
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
    reactionFormulaTypeIds,
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

  const showsTable =
    !(loading && !data) &&
    !error &&
    syncConfigured &&
    !(rows.length === 0 && originals.length === 0 && ownedBlueprints.length === 0);
  const capNote =
    sources.size > 0 && displayRows.length > shownRows.length
      ? t('bpcContracts.resultsCapped', {
          shown: shownRows.length.toLocaleString(),
          total: displayRows.length.toLocaleString(),
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
        {/* What the visible branch below says; nothing for a build with no sync backend. */}
        {loading
          ? ''
          : error
            ? t('common.loadFailedTitle')
            : syncConfigured && contractsResult === null
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
        ) : !syncConfigured ? (
          <EmptyState
            title={t('bpcContracts.notConfiguredTitle')}
            hint={t('bpcContracts.notConfiguredHint')}
          />
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
                              className="max-w-full self-start truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
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
                          shown: shownRows.length.toLocaleString(),
                          total: displayRows.length.toLocaleString(),
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
