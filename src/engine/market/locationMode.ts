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
