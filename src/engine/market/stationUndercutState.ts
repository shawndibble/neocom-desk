export type StationUndercutState = 'beaten' | 'clear' | 'unknown';

export interface StationUndercutResult {
  state: StationUndercutState;
  rivalPrice: number | null;
}

export interface StationSidePrices {
  sellMin: number | null;
  buyMax: number | null;
}

const UNKNOWN: StationUndercutResult = { state: 'unknown', rivalPrice: null };

export function classifyStationUndercut(
  myPrice: number,
  isBuyOrder: boolean,
  aggregate: StationSidePrices | null,
  ownPrices: readonly number[] = []
): StationUndercutResult {
  if (!aggregate) return UNKNOWN;
  const bestPrice = isBuyOrder ? aggregate.buyMax : aggregate.sellMin;
  if (bestPrice === null) return UNKNOWN;
  const beatsMe = isBuyOrder ? bestPrice > myPrice : bestPrice < myPrice;
  return beatsMe && !ownPrices.includes(bestPrice)
    ? { state: 'beaten', rivalPrice: bestPrice }
    : { state: 'clear', rivalPrice: bestPrice };
}
