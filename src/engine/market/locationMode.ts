/**
 * Global Market Region routing (CONTEXT.md round 12): a handful of items
 * (PLEX today) trade in a region of their own rather than the normal
 * regional books. Pure — `globalMarkets` is `src/sde/loadMarketSde.ts`'s
 * `GlobalMarketEntry[]` reshaped into a typeId lookup by the caller.
 */

export interface GlobalMarketOverride {
  regionId: number;
  regionName: string;
}

export interface ResolvedOrderBookRegion {
  regionId: number;
  /** Non-null when typeId trades in a Global Market Region — the UI owes the user a reason the shown location isn't the one picked. */
  override: GlobalMarketOverride | null;
}

/**
 * Which region to read typeId's order book from: `chosenRegionId` (the
 * Location Mode's Region or Trade Hub selection), unless typeId trades in a
 * Global Market Region, which wins regardless of what was picked.
 */
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

/**
 * Location Mode's All regions choice (Region mode over every Market Region),
 * a sentinel distinct from `null` — which already means "no region picked
 * yet, read the hub's".
 */
export const ALL_REGIONS = 'all';
export type RegionChoice = number | typeof ALL_REGIONS;

/**
 * Which regions hold any of `allowed`'s systems — what All regions fetches
 * once a Jump Range is set, so "within 5 jumps" costs the two or three
 * regions in reach rather than every one. A system the lookup doesn't know
 * is skipped: its orders couldn't be placed in range anyway.
 */
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
