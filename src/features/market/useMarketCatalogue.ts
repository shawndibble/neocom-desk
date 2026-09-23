/**
 * The Market Browser's SDE catalogue: groups/types/NPC stations/solar
 * systems/market regions, loaded together (one `Promise.all`) since the tree,
 * the URL param validation and the order book's location lookups all need
 * them before they can render anything meaningful. Not precached — most
 * installs never open /market (CONTEXT.md round 10) — so this is the lazy
 * load for it.
 *
 * `variations.json` is fetched by its own effect, independent of the five
 * above: a slow or failed variations load must never block or error the rest
 * of the page (the Variations panel just falls back to Market Group
 * siblings — see `variationIndex` below).
 */
import { useEffect, useMemo, useState } from 'react';
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
import { buildVariationIndex, type VariationIndex } from '@/engine/market/variations';

/**
 * Stands in for variationIndex before variations.json resolves (or if it
 * fails to load) — every lookup against it comes back empty, which
 * getVariationRows already treats the same as "this item has no variation
 * data" and degrades to the Market Group sibling fallback. Keeps the
 * Variations panel's own data source independent of the page's primary
 * catalogue load.
 */
const EMPTY_VARIATION_INDEX = buildVariationIndex({}, {});

export interface MarketCatalogue {
  groups: MarketGroupNode[] | null;
  types: MarketTypeEntry[] | null;
  npcStations: NpcStationEntry[] | null;
  solarSystems: SolarSystemEntry[] | null;
  marketRegions: MarketRegionEntry[] | null;
  catalogueError: boolean;
  /** True once the five slices above have all settled — variationData isn't included (see file doc). */
  catalogueLoading: boolean;
  /** Clears the error and re-runs the load — the one recovery this page has short of F5. */
  retry: () => void;
  /** One pass over `groups`, built here so the tree's id and parent lookups agree. */
  groupsById: ReadonlyMap<number, MarketGroupNode>;
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  typesById: ReadonlyMap<number, MarketTypeEntry>;
  npcStationMap: ReadonlyMap<number, { name: string; systemId: number }>;
  solarSystemMap: ReadonlyMap<number, { name: string; security: number }>;
  allMarketRegionIds: number[];
  systemRegions: ReadonlyMap<number, { regionId: number }>;
  /** Built once per SDE load, not per selection (see file doc). */
  variationIndex: VariationIndex;
}

export function useMarketCatalogue(): MarketCatalogue {
  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  const [types, setTypes] = useState<MarketTypeEntry[] | null>(null);
  const [npcStations, setNpcStations] = useState<NpcStationEntry[] | null>(null);
  const [solarSystems, setSolarSystems] = useState<SolarSystemEntry[] | null>(null);
  const [marketRegions, setMarketRegions] = useState<MarketRegionEntry[] | null>(null);
  const [variationData, setVariationData] = useState<VariationData | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  // Bumped by Refresh after a failed catalogue load to re-run the load effect.
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

  // Fetched independently of the catalogue load above: variations.json is
  // Variations-panel-only data, so a slow or failed fetch degrades that one
  // panel to its Market-Group-sibling fallback (see variationIndex below)
  // rather than blocking or erroring the whole Market route.
  useEffect(() => {
    let cancelled = false;
    void loadVariations()
      .then((variations) => {
        if (!cancelled) setVariationData(variations);
      })
      .catch(() => {
        // Leaves variationData null — variationIndex below already treats
        // that the same as "no variation data for this item".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function retry() {
    setCatalogueError(false);
    setCatalogueTick((n) => n + 1);
  }

  // One pass over `groups` builds both lookups this route needs — by id (URL
  // param validation and the ancestor walk) and by parent (the tree's own
  // render shape).
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

  // Defaults to EMPTY_VARIATION_INDEX before variations.json resolves, so
  // the Variations panel falls back to siblings rather than going blank.
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
