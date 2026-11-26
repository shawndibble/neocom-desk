import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { loadHubFor } from '@/features/market/hub';
import { getHubPricesWithStatus } from '@/market/prices';

export interface HaulPrices {
  unitIsk: Map<number, number>;
  unavailable: boolean;
}

export async function loadHaulPrices(typeIds: Iterable<number>): Promise<HaulPrices> {
  const ids = [...new Set(typeIds)];
  const unitIsk = new Map<number, number>();
  if (ids.length === 0) return { unitIsk, unavailable: false };
  try {
    const hub = getTradeHub(await loadHubFor('assets')) ?? DEFAULT_TRADE_HUB;
    const { prices, unreachable } = await getHubPricesWithStatus(hub, ids);
    for (const [typeId, p] of prices)
      if (p.sellMin !== null && p.sellMin > 0) unitIsk.set(typeId, p.sellMin);
    return { unitIsk, unavailable: unreachable };
  } catch {
    return { unitIsk, unavailable: true };
  }
}
