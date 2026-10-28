import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { SPACE_KINDS } from '@/engine/space';
import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { bpcMarketLookup, type BpcSourceData } from '@/features/bpcContracts/searchBpcOffers';
import {
  useVisibleBpcSearchColumns,
  type BpcSearchColumnId,
} from '@/features/bpcContracts/bpcSearchColumns';
import { useSpaceFilter } from '@/features/bpcContracts/bpcSpaceFilterPref';
import { useLpBlueprintOffers } from '@/features/bpcContracts/useLpBlueprintOffers';
import { useCommunityBlueprintOffers } from '@/features/bpcContracts/useCommunityBlueprintOffers';
import { placeLpRows } from '@/features/bpcContracts/lpStationRows';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { useLpValue } from '@/features/loyalty/lpValue';
import { useBpcSources } from '@/features/bpcContracts/bpcSourcesPref';
import { useMarketBpoOrders } from '@/features/bpcContracts/useMarketBpoOrders';
import { useMarketHub } from '@/features/market/hub';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type JumpsCellValue,
} from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { bpcSourcingParams, SOURCE_TOGGLES, type SourceToggle } from './bpcSourcingUrl';
import type { UiFilter } from './BpcFilterBar';
import { hubStationIn, marketLookupRegion } from './bpcSourcingHelpers';
import {
  EMPTY_CONTRACT_LOCATIONS,
  EMPTY_MAP,
  EMPTY_OWNED_BLUEPRINTS,
  EMPTY_OWNED_LOCATIONS,
  loadBpcContractsSnapshot,
} from './bpcSourcingSnapshot';

/**
 * Everything the panel reads before it ranks: the snapshot load, the URL
 * filter group, the remembered preferences, and the market / LP / Community
 * source hooks, folded into `sourceData`.
 */
export function useBpcSourcingData() {
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadBpcContractsSnapshot,
    undefined,
    { cacheKey: 'bpcContracts' }
  );

  const contractsResult = data?.contractsResult ?? null;
  const blueprintNames = data?.blueprintNames ?? EMPTY_MAP;
  const reactionFormulaTypeIds = data?.reactionFormulaTypeIds ?? null;
  const regionNames = data?.regionNames ?? EMPTY_MAP;
  const ownedBlueprints = data?.ownedBlueprints ?? EMPTY_OWNED_BLUEPRINTS;
  const contractLocations = data?.contractLocations ?? EMPTY_CONTRACT_LOCATIONS;
  const ownedLocations = data?.ownedLocations ?? EMPTY_OWNED_LOCATIONS;

  const spaceFilter = useSpaceFilter((state) => state.value);
  const setSpaceFilter = useSpaceFilter((state) => state.setValue);
  useHydratedStore(useSpaceFilter);

  const visibleColumns = useVisibleBpcSearchColumns((state) => state.value);
  const setVisibleColumns = useVisibleBpcSearchColumns((state) => state.setValue);
  useHydratedStore(useVisibleBpcSearchColumns);

  function toggleColumn(id: BpcSearchColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  const hideAuctionsDefault = useBpcHideAuctionsDefault((state) => state.value);
  const hidePlexDefault = useBpcHidePlexDefault((state) => state.value);
  useHydratedStore(useBpcHideAuctionsDefault, useBpcHidePlexDefault);
  const sourcingParams = useMemo(
    () => bpcSourcingParams({ hideAuctions: hideAuctionsDefault, hidePlex: hidePlexDefault }),
    [hideAuctionsDefault, hidePlexDefault]
  );
  // Source is a remembered default behind its URL key (`bpcSourcesPref.ts`):
  // a bare visit reopens the pilot's last picks, a link's `sourcing.src` still
  // wins, and only an edit is stored. Same group, so it writes in the same
  // navigation as the rest.
  const rememberedSources = useBpcSources((state) => state.value);
  useHydratedStore(useBpcSources);
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

  const rows = useMemo(() => contractsResult?.data?.rows ?? [], [contractsResult]);
  /** Contract originals (issue #1241). Absent on a snapshot cached before #1240. */
  const originals = useMemo(() => contractsResult?.data?.originals ?? [], [contractsResult]);

  // The market BPO lookup's region when the Region filter is "All regions":
  // an Order Book is one region's, so it falls back to the pilot's own market
  // hub rather than guessing (issue #1241).
  const marketHubId = useMarketHub((state) => state.value);
  const marketHubHydrated = useHydratedStore(useMarketHub);
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
  const lpValueHydrated = useHydratedStore(useLpValue);
  const blueprintTypeIds = useMemo(() => [...blueprintNames.keys()], [blueprintNames]);
  const lpOffers = useLpBlueprintOffers({
    characterId: activeCharacterId,
    // Wait for the pilot's LP Value, or the offers price at the market rate and then reload.
    enabled: sources.has('lp') && lpValueHydrated,
    blueprintTypeIds,
    hub: marketHub,
    lpValue,
  });
  // An LP row's system is its corporation's nearest station: the station list loads
  // lazily (outside the install precache) and never blocks the table.
  const lpRowsFound = lpOffers.rows.length > 0;
  const [npcStations, setNpcStations] = useState<readonly NpcStationEntry[] | null>(null);
  const [npcStationsFailed, setNpcStationsFailed] = useState(false);
  useEffect(() => {
    if (!lpRowsFound) return;
    let cancelled = false;
    loadNpcStations().then(
      (list) => {
        if (!cancelled) setNpcStations(list);
      },
      () => {
        if (!cancelled) setNpcStationsFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [lpRowsFound]);
  const lpRows = useMemo(
    () => placeLpRows(lpOffers.rows, npcStations, jumpFilter.jumps),
    [lpOffers.rows, npcStations, jumpFilter.jumps]
  );
  const lpStationsLoading = lpRowsFound && npcStations === null && !npcStationsFailed;
  const bpcRowJumps = useCallback(
    (row: BpcSearchRow): JumpsCellValue => {
      if (row.systemId === null) {
        // An unplaced LP row waits on the station list and the distances like any placed row.
        if (row.source !== 'lp') return { kind: 'value', count: null };
        if (lpStationsLoading) return { kind: 'loading' };
        return jumpFilter.jumpsStatus === 'ready'
          ? { kind: 'value', count: null }
          : { kind: jumpFilter.jumpsStatus };
      }
      if (jumpFilter.jumpsStatus !== 'ready') return { kind: jumpFilter.jumpsStatus };
      return { kind: 'value', count: jumpFilter.jumps?.get(row.systemId) ?? null };
    },
    [jumpFilter, lpStationsLoading]
  );
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
      lpRows,
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
      lpRows,
      communityOffers.rows,
    ]
  );

  return {
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
    communityOffers,
    sourceData,
  };
}
