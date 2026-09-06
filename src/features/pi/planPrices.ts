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
 * `fetchedAt` is when this read completed, which is what the Plan tab's
 * `DataAgeBadge` shows. It is a lower bound on the true age, not the exact
 * one: `getHubPrices` keeps its own 15-minute TTL cache underneath, so a read
 * that hits it returns prices up to that much older. The badge's finest bucket
 * is an hour, so the tone is right either way, and the alternative — no badge
 * at all on an ESI-backed view — is the worse trade (docs/DESIGN.md §4).
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
  /**
   * Highest hub buy for the same types — what a sale actually fetches.
   *
   * Out of the *same* `loadMarketSnapshot` aggregate as `prices`, not a second
   * read: `MarketSnapshot` has carried both sides all along for Build Plans'
   * `'buy'` basis and the LP store's instant-sell revenue. Planetary code was
   * simply dropping one of them, and then valuing what a colony sells at the
   * price it would pay to buy it back.
   */
  buyPrices: Record<number, number>;
  /** Requested types the hub had no sell order for. */
  unpriced: number[];
  /** True when the price fetch itself failed, as opposed to the hub simply not quoting a type. */
  failed: boolean;
  /** When this read completed. See the note above on why it is a lower bound. */
  fetchedAt: Date;
}

/** Both sides of the hub book for every type a chain can involve, in one call. */
export async function loadPlanPrices(hub: TradeHub, typeIds: number[]): Promise<PlanPrices> {
  const wanted = [...new Set(typeIds)];
  if (wanted.length === 0)
    return { prices: {}, buyPrices: {}, unpriced: [], failed: false, fetchedAt: new Date() };

  let snapshot: { hubPrices: Record<number, number>; hubBuyPrices: Record<number, number> };
  try {
    const read = await loadMarketSnapshot(hub, wanted);
    snapshot = { hubPrices: read.hubPrices, hubBuyPrices: read.hubBuyPrices ?? {} };
  } catch {
    return { prices: {}, buyPrices: {}, unpriced: wanted, failed: true, fetchedAt: new Date() };
  }

  const prices: Record<number, number> = {};
  const buyPrices: Record<number, number> = {};
  const unpriced: number[] = [];
  for (const typeId of wanted) {
    const price = snapshot.hubPrices[typeId];
    if (price != null && Number.isFinite(price)) prices[typeId] = price;
    else unpriced.push(typeId);
    // A type with sell orders but no buy order is *not* unpriced — it is
    // priceable, just not instantly sellable. Leaving it out here lets the
    // engines fall back to the ask for it rather than refusing the chain.
    const bid = snapshot.hubBuyPrices[typeId];
    if (bid != null && Number.isFinite(bid)) buyPrices[typeId] = bid;
  }
  return { prices, buyPrices, unpriced, failed: false, fetchedAt: new Date() };
}
