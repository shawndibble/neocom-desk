export const MAX_BASELINE_REGIONS = 3;

export const THE_FORGE_REGION_ID = 10000002;

export type BaselineReason = 'forge' | 'hub' | 'nearest' | 'here';

export interface BaselineRegion {
  regionId: number;
  reasons: BaselineReason[];
}

export function baselineRegions(input: {
  hubRegionId: number | null;
  nearestHubRegionId: number | null;
  currentRegionId: number | null;
}): BaselineRegion[] {
  const regions: BaselineRegion[] = [];
  const add = (regionId: number | null, reason: BaselineReason) => {
    if (regionId === null) return;
    const existing = regions.find((region) => region.regionId === regionId);
    if (existing) existing.reasons.push(reason);
    else regions.push({ regionId, reasons: [reason] });
  };
  add(THE_FORGE_REGION_ID, 'forge');
  add(input.hubRegionId, 'hub');
  add(input.nearestHubRegionId, 'nearest');
  add(input.currentRegionId, 'here');
  return regions.slice(0, MAX_BASELINE_REGIONS);
}

export function nearestHub<T extends { systemId: number }>(
  hubs: readonly T[],
  jumps: ReadonlyMap<number, number> | null
): T | null {
  if (jumps === null) return null;
  let best: { hub: T; distance: number } | null = null;
  for (const hub of hubs) {
    const distance = jumps.get(hub.systemId);
    if (distance === undefined) continue;
    if (best === null || distance < best.distance) best = { hub, distance };
  }
  return best?.hub ?? null;
}
