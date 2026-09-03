/**
 * Hub prices for a planetary chain, over the one price path the app already
 * has.
 *
 * `loadMarketSnapshot` is reused rather than reached past: a Build Plan and a
 * planetary chain must agree about what a Neocom costs at Jita, and a second
 * price path is how they would stop agreeing. Its `adjustedPrices` and
 * `systemCostIndex` are simply unused here — a planetary chain has no
 * blueprint, no job cost and no EIV.
 *
 * A type the hub has no sell order for stays *absent* from `prices`, never
 * zero: `engine/pi/chain.ts` refuses to cost a chain with a missing price, and
 * `planModel.costPlan` turns that refusal into a "not priceable" state. Zero
 * would instead produce a confident wrong margin, which is the one outcome
 * CONTEXT.md round 29's rule exists to prevent.
 */
import { loadMarketSnapshot } from '@/features/industry/marketData';
import type { TradeHub } from '@/market/hubs';

export interface PlanPrices {
  /** ISK per unit by typeId. A type the hub does not quote is absent, not zero. */
  prices: Record<number, number>;
  /** Requested types the hub had no sell order for. */
  unpriced: number[];
  /** True when the price fetch itself failed, as opposed to the hub simply not quoting a type. */
  failed: boolean;
}

/** Lowest hub sell for every type a chain can involve, in one call. */
export async function loadPlanPrices(hub: TradeHub, typeIds: number[]): Promise<PlanPrices> {
  const wanted = [...new Set(typeIds)];
  if (wanted.length === 0) return { prices: {}, unpriced: [], failed: false };

  let hubPrices: Record<number, number>;
  try {
    hubPrices = (await loadMarketSnapshot(hub, wanted)).hubPrices;
  } catch {
    return { prices: {}, unpriced: wanted, failed: true };
  }

  const prices: Record<number, number> = {};
  const unpriced: number[] = [];
  for (const typeId of wanted) {
    const price = hubPrices[typeId];
    if (price != null && Number.isFinite(price)) prices[typeId] = price;
    else unpriced.push(typeId);
  }
  return { prices, unpriced, failed: false };
}
