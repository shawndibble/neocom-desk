/**
 * Classifies one open market order against its own station's best rival
 * price, for the `marketOrderUndercut` Notification Event (issue #1423) —
 * `beaten` (undercut for a sell order, outbid for a buy order), `clear`, or
 * `unknown` when the station's price cannot be read at all.
 *
 * Deliberately not a reuse of `openOrdersModel.ts`'s private `buildStationTier`:
 * that function reads a null best price as "no rival" (`beatsMe: false`),
 * which is right for its badge but wrong here. A null best price on the
 * order's OWN side (sell for a sell order, buy for a buy order) can only mean
 * the station's price could not be read — my own open order is itself an
 * order on that side, so Fuzzwork's aggregate for that side can never be
 * genuinely empty while my order stands. Collapsing "no answer" into "no
 * rival" here would read a Fuzzwork outage as "you're safe" and then, on the
 * next good poll, as a fresh undercut — the false all-clear this module
 * exists to avoid (see the `armed` latch in `engine/notificationDiffs.ts`).
 *
 * Only the strict-comparison direction rule is shared with `buildStationTier`
 * — a rival price EQUAL to mine does not beat me, because my own order sits
 * inside the aggregate too.
 *
 * Pure, and deliberately structural about its price input (`{ sellMin,
 * buyMax }`) rather than importing `HubAggregate` as a value: `src/engine`
 * must carry no runtime dependency on `src/market` (ARCHITECTURE.md). A
 * caller passing a real `HubAggregate` satisfies this shape for free.
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
  // My own order guarantees at least one order on this side at this station —
  // a null reading here is the fetch failing, never a genuinely empty book.
  if (bestPrice === null) return UNKNOWN;
  const beatsMe = isBuyOrder ? bestPrice > myPrice : bestPrice < myPrice;
  return beatsMe
    ? { state: 'beaten', rivalPrice: bestPrice }
    : { state: 'clear', rivalPrice: bestPrice };
}
