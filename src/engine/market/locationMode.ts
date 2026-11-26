export interface GlobalMarketOverride {
  regionId: number;
  regionName: string;
}

export interface ResolvedOrderBookRegion {
  regionId: number;
  override: GlobalMarketOverride | null;
}

export function resolveOrderBookRegion(
  typeId: number,
  chosenRegionId: number,
  globalMarkets: ReadonlyMap<number, GlobalMarketOverride>
): ResolvedOrderBookRegion {
  const override = globalMarkets.get(typeId) ?? null;
  return override
    ? { regionId: override.regionId, override }
    : { regionId: chosenRegionId, override: null };
}

export const ALL_REGIONS = 'all';
export type RegionChoice = number | typeof ALL_REGIONS;

export function regionsForSystems(
  allowed: ReadonlySet<number>,
  systemsById: ReadonlyMap<number, { regionId: number }>
): ReadonlySet<number> {
  const regions = new Set<number>();
  for (const systemId of allowed) {
    const system = systemsById.get(systemId);
    if (system) regions.add(system.regionId);
  }
  return regions;
}
