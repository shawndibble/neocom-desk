import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
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
import { useHubFor } from '@/features/market/hub';
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
  const solarSystems = useSolarSystemIndex();
  const selectedTypeId = params['sourcing.type'];

  const rows = useMemo(() => contractsResult?.data?.rows ?? [], [contractsResult]);
  const originals = useMemo(() => contractsResult?.data?.originals ?? [], [contractsResult]);

  const { hubId: marketHubId, hydrated: marketHubHydrated } = useHubFor('industry');
  const marketHub = getTradeHub(marketHubId) ?? DEFAULT_TRADE_HUB;
  const [marketRefreshTick, setMarketRefreshTick] = useState(0);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const refreshAll = useCallback(() => {
    refreshRef.current();
    setMarketRefreshTick((tick) => tick + 1);
  }, []);

  const activeSpaceKinds = useMemo(
    () => (spaceFilter.length === SPACE_KINDS.length ? null : new Set(spaceFilter)),
    [spaceFilter]
  );

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
    enabled: sources.has('lp') && lpValueHydrated,
    blueprintTypeIds,
    hub: marketHub,
    lpValue,
  });
  const lpRowsFound = lpOffers.rows.length > 0;
  const npcLoad = useKeyedLoad('npc-stations', loadNpcStations, !lpRowsFound);
  const npcStations: readonly NpcStationEntry[] | null = npcLoad.data ?? null;
  const npcStationsFailed = npcLoad.status === 'failed';
  const lpRows = useMemo(
    () => placeLpRows(lpOffers.rows, npcStations, jumpFilter.jumps),
    [lpOffers.rows, npcStations, jumpFilter.jumps]
  );
  const lpStationsLoading = lpRowsFound && npcStations === null && !npcStationsFailed;
  const bpcRowJumps = useCallback(
    (row: BpcSearchRow): JumpsCellValue => {
      if (row.systemId === null) {
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
