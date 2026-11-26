import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadMarketGroups,
  loadMarketTypes,
  loadNpcStations,
  loadSolarSystems,
  loadMarketRegions,
  loadVariations,
} from '@/sde/loadMarketSde';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
  VariationData,
} from '@/sde/marketTypes';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import { buildVariationIndex, type VariationIndex } from '@/engine/market/variations';
import { useAsyncLoad } from '@/lib/useAsyncLoad';

const EMPTY_VARIATION_INDEX = buildVariationIndex({}, {});

export interface MarketCatalogue {
  groups: MarketGroupNode[] | null;
  types: MarketTypeEntry[] | null;
  npcStations: NpcStationEntry[] | null;
  solarSystems: SolarSystemEntry[] | null;
  marketRegions: MarketRegionEntry[] | null;
  catalogueError: boolean;
  catalogueLoading: boolean;
  retry: () => void;
  groupsById: ReadonlyMap<number, MarketGroupNode>;
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  typesById: ReadonlyMap<number, MarketTypeEntry>;
  npcStationMap: ReadonlyMap<number, { name: string; systemId: number }>;
  solarSystemMap: ReadonlyMap<number, { name: string; security: number }>;
  allMarketRegionIds: number[];
  systemRegions: ReadonlyMap<number, { regionId: number }>;
  variationIndex: VariationIndex;
}

export function useMarketCatalogue(): MarketCatalogue {
  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
  const [marketRegions, setMarketRegions] = useState<MarketRegionEntry[] | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  const [catalogueTick, setCatalogueTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadMarketGroups(),
      loadMarketTypes(),
      loadNpcStations(),
      loadSolarSystems(),
      loadMarketRegions(),
    ])
      .then(([g, ty, stations, systems, regions]) => {
        if (cancelled) return;
        setGroups(g);
        setTypes(ty);
        setNpcStations(stations);
        setSolarSystems(systems);
        setMarketRegions(regions);
      })
      .catch(() => {
        if (!cancelled) setCatalogueError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogueTick]);

  const variationData: VariationData | null = useAsyncLoad(loadVariations).data ?? null;

  const retry = useCallback(() => {
    setCatalogueError(false);
    setCatalogueTick((n) => n + 1);
  }, []);
  useRetryOnReconnect(catalogueError, retry);

  const groupCatalogue = useMemo(() => {
    const byId = new Map<number, MarketGroupNode>();
    const byParent = new Map<number | null, MarketGroupNode[]>();
    for (const group of groups ?? []) {
      byId.set(group.id, group);
      const list = byParent.get(group.parentId) ?? [];
      list.push(group);
      byParent.set(group.parentId, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return { byId, byParent };
  }, [groups]);

  const typesByGroup = useMemo(() => {
    const map = new Map<number, MarketTypeEntry[]>();
    for (const type of types ?? []) {
      const list = map.get(type.marketGroupId) ?? [];
      list.push(type);
      map.set(type.marketGroupId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [types]);

  const typesById = useMemo(
    () => new Map((types ?? []).map((type) => [type.typeId, type])),
    [types]
  );

  const npcStationMap = useMemo(
    () => new Map((npcStations ?? []).map((s) => [s.id, { name: s.name, systemId: s.systemId }])),
    [npcStations]
  );
  const solarSystemMap = useMemo(
    () => new Map((solarSystems ?? []).map((s) => [s.id, { name: s.name, security: s.security }])),
    [solarSystems]
  );

  const allMarketRegionIds = useMemo(
    () => (marketRegions ?? []).map((r) => r.id).sort((a, b) => a - b),
    [marketRegions]
  );
  const systemRegions = useMemo(
    () => new Map((solarSystems ?? []).map((s) => [s.id, { regionId: s.regionId }])),
    [solarSystems]
  );

  const variationIndex = useMemo(
    () =>
      variationData
        ? buildVariationIndex(variationData.types, variationData.metaGroups)
        : EMPTY_VARIATION_INDEX,
    [variationData]
  );

  const catalogueLoading =
    !catalogueError && (!groups || !types || !npcStations || !solarSystems || !marketRegions);

  return {
    groups,
    types,
    npcStations,
    solarSystems,
    marketRegions,
    catalogueError,
    catalogueLoading,
    retry,
    groupsById: groupCatalogue.byId,
    childrenByParent: groupCatalogue.byParent,
    typesByGroup,
    typesById,
    npcStationMap,
    solarSystemMap,
    allMarketRegionIds,
    systemRegions,
    variationIndex,
  };
}
