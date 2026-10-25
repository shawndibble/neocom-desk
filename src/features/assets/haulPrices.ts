/**
 * What a Move plan's cargo is worth, one unit each: the sell price at the
 * default Trade Hub, the way Appraisal prices a pile. Read only when a plan
 * is worked out. An item with no price is left out of the map (the plan counts
 * it as 0 ISK and says so); a price feed that cannot be reached comes back as
 * `unavailable`, never a throw.
 */
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { getHubPricesWithStatus } from '@/market/prices';

export interface HaulPrices {
  unitIsk: Map<number, number>;
  /** The price source could not be reached, so a missing price says nothing about the market. */
  unavailable: boolean;
}

export async function loadHaulPrices(typeIds: Iterable<number>): Promise<HaulPrices> {
  const ids = [...new Set(typeIds)];
  const unitIsk = new Map<number, number>();
  if (ids.length === 0) return { unitIsk, unavailable: false };
  try {
    const { prices, unreachable } = await getHubPricesWithStatus(DEFAULT_TRADE_HUB, ids);
    for (const [typeId, p] of prices)
      if (p.sellMin !== null && p.sellMin > 0) unitIsk.set(typeId, p.sellMin);
    return { unitIsk, unavailable: unreachable };
  } catch {
    return { unitIsk, unavailable: true };
  }
}
