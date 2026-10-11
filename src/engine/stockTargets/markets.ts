/**
 * The Stock tab's landing list: one summary per market the pilot stocks,
 * ranked so the market that needs restocking most comes first.
 */

export interface MarketSummary {
  listId: string;
  items: number;
  out: number;
  low: number;
  readyToList: number;
  /** Known ISK to buy or build what the hangar cannot cover. */
  costToFill: number;
}

export type MarketNeed = 'out' | 'low' | 'stocked';

export function marketNeed(market: MarketSummary): MarketNeed {
  if (market.out > 0) return 'out';
  if (market.low > 0) return 'low';
  return 'stocked';
}

/** Most items out first, then most low, then the dearest to fill. */
export function rankMarkets<T extends Pick<MarketSummary, 'out' | 'low' | 'costToFill'>>(
  markets: readonly T[]
): T[] {
  return [...markets].sort((a, b) => b.out - a.out || b.low - a.low || b.costToFill - a.costToFill);
}
