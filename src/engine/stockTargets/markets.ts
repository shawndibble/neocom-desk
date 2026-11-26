export interface MarketSummary {
  listId: string;
  items: number;
  out: number;
  low: number;
  readyToList: number;
  costToFill: number;
}

export type MarketNeed = 'out' | 'low' | 'stocked';

export function marketNeed(market: MarketSummary): MarketNeed {
  if (market.out > 0) return 'out';
  if (market.low > 0) return 'low';
  return 'stocked';
}

export const marketNeedRank = (market: MarketSummary): number =>
  ({ out: 0, low: 1, stocked: 2 })[marketNeed(market)];

export function rankMarkets<T extends Pick<MarketSummary, 'out' | 'low' | 'costToFill'>>(
  markets: readonly T[]
): T[] {
  return [...markets].sort((a, b) => b.out - a.out || b.low - a.low || b.costToFill - a.costToFill);
}
