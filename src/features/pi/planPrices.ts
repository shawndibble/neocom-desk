import { loadMarketSnapshot } from '@/features/industry/marketData';
import type { TradeHub } from '@/market/hubs';

export interface PlanPrices {
  prices: Record<number, number>;
  buyPrices: Record<number, number>;
  unpriced: number[];
  failed: boolean;
  fetchedAt: Date;
}

export async function loadPlanPrices(hub: TradeHub, typeIds: number[]): Promise<PlanPrices> {
  const wanted = [...new Set(typeIds)];
  if (wanted.length === 0)
    return { prices: {}, buyPrices: {}, unpriced: [], failed: false, fetchedAt: new Date() };

  let snapshot: { hubPrices: Record<number, number>; hubBuyPrices: Record<number, number> };
  let unreachable: boolean;
  try {
    const read = await loadMarketSnapshot(hub, wanted);
    snapshot = { hubPrices: read.hubPrices, hubBuyPrices: read.hubBuyPrices ?? {} };
    unreachable = read.hubPricesUnreachable === true;
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
    const bid = snapshot.hubBuyPrices[typeId];
    if (bid != null && Number.isFinite(bid)) buyPrices[typeId] = bid;
  }
  const failed = unreachable || Object.keys(prices).length === 0;
  return { prices, buyPrices, unpriced, failed, fetchedAt: new Date() };
}
