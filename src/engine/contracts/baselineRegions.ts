/**
 * Which regions BPC Sourcing's "Cheapest by region" strip shows. A blueprint
 * can be listed in dozens of regions, but a pilot prices against a few: The
 * Forge (Jita, the market everyone uses as a baseline, always shown), their own
 * market hub's region, and the region of the trade hub nearest to them. Where
 * these coincide the region appears once, naming every reason, and the freed
 * slot goes to the region they are in. Three regions at most, one when all
 * coincide. Any other region is the Region filter's job. Pure: jumps come in
 * from `localJumpDistances`.
 */

/** Regions shown at most. */
export const MAX_BASELINE_REGIONS = 3;

/** The Forge: Jita's region. */
export const THE_FORGE_REGION_ID = 10000002;

export type BaselineReason = 'forge' | 'hub' | 'nearest' | 'here';

export interface BaselineRegion {
  regionId: number;
  /** Why it is shown, in the order the reasons were applied. */
  reasons: BaselineReason[];
}

/**
 * The Forge, the pilot's market hub's region, the nearest hub's, then their own
 * region: each once, the first three distinct. A fourth distinct region is
 * dropped, but a current region that matches an earlier one still adds its reason.
 */
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

/**
 * The hub fewest jumps from the origin (`jumps`: system id to distance), the
 * earlier in `hubs` on a tie. A hub the stargate graph does not reach is
 * skipped; `null` when none is reachable or distances are not known yet.
 */
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
