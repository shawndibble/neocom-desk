/**
 * Classifies one open market order against its own station's best rival
 * price: `beaten` (undercut for a sell order, outbid for a buy order),
 * `clear`, or `unknown` when the station's price can't be read.
 *
 * Not a reuse of `openOrdersModel.ts`'s `buildStationTier`: that function
 * reads a null best price as "no rival", which is wrong here — my own order
 * guarantees the station's own-side book is never genuinely empty, so a null
 * reading can only be a failed fetch. Reading it as "no rival" would show a
 * Fuzzwork outage as safe, then a false undercut on the next good poll (see
 * the `armed` latch in `engine/notificationDiffs.ts`).
 */

export type StationUndercutState = 'beaten' | 'clear' | 'unknown';

export interface StationUndercutResult {
  state: StationUndercutState;
  /** The rival price that produced `state`, or null when `state` is 'unknown'. */
  rivalPrice: number | null;
}

/** The station-side price this order's own side reads off an aggregate. */
export interface StationSidePrices {
  sellMin: number | null;
  buyMax: number | null;
}

const UNKNOWN: StationUndercutResult = { state: 'unknown', rivalPrice: null };

export function classifyStationUndercut(
  myPrice: number,
  isBuyOrder: boolean,
  aggregate: StationSidePrices | null
): StationUndercutResult {
  if (!aggregate) return UNKNOWN;
  const bestPrice = isBuyOrder ? aggregate.buyMax : aggregate.sellMin;
  if (bestPrice === null) return UNKNOWN;
  const beatsMe = isBuyOrder ? bestPrice > myPrice : bestPrice < myPrice;
  return beatsMe
    ? { state: 'beaten', rivalPrice: bestPrice }
    : { state: 'clear', rivalPrice: bestPrice };
}
