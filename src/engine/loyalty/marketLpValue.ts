/**
 * The market's **LP Value** for one corporation's LP: what its store's
 * offers turn a loyalty point into at a Trade Hub, after fees — the same
 * ISK/LP the LP Store page ranks its offers by. Read off the store's best
 * offers rather than its single best, and only from offers the hub could
 * absorb a few redemptions of and that trade every day, so one thin, lucky
 * order can't set the rate.
 */

import { upperMedian } from '../math';

/** One store offer as the LP Store page prices it. */
export interface LpValueCandidate {
  /** Net ISK per LP; null when the offer can't be priced. */
  iskPerLp: number | null;
  /** Units of what the offer hands out for sale at the hub. */
  sellVolume: number;
  /** Units one redemption hands out. */
  quantity: number;
  /** Units of it traded a day lately; null when unchecked (no trade data), and the offer is kept. */
  soldPerDay: number | null;
}

/** An offer counts only when the hub has this many redemptions' worth for sale. */
export const MIN_DEPTH_REDEMPTIONS = 5;
/** An offer counts only when what it hands out trades at least this many units a day. */
export const MIN_SOLD_PER_DAY = 1;
/** How many of the best offers the rate is the median of. */
const TOP_OFFERS = 5;
/** Fewer qualifying offers than this is too little to call a rate. */
const MIN_OFFERS = 3;

export function marketLpValue(candidates: readonly LpValueCandidate[]): number | null {
  const rates = candidates
    .filter(
      (c) =>
        c.iskPerLp !== null &&
        c.iskPerLp > 0 &&
        c.sellVolume >= MIN_DEPTH_REDEMPTIONS * Math.max(1, c.quantity) &&
        (c.soldPerDay === null || c.soldPerDay >= MIN_SOLD_PER_DAY)
    )
    .map((c) => c.iskPerLp!)
    .sort((a, b) => b - a)
    .slice(0, TOP_OFFERS);
  if (rates.length < MIN_OFFERS) return null;
  return upperMedian(rates);
}

export interface LpRate {
  /** ISK per LP; null when nothing prices the LP — the offer's LP is then left unpriced, never free. */
  rate: number | null;
  /**
   * `'yours'`: the pilot's own LP Value; `'market'`: this store's market value;
   * `'free'`: LP counted as already earned (a blueprint with no LP Value set).
   */
  source: 'yours' | 'market' | 'free' | null;
}

/** The rate an LP Store pick's LP is priced at: the pilot's own LP Value when set, else the store's market value. */
export function lpRate(ownValue: number, marketValue: number | null): LpRate {
  if (Number.isFinite(ownValue) && ownValue > 0) return { rate: ownValue, source: 'yours' };
  if (marketValue !== null && Number.isFinite(marketValue) && marketValue > 0) {
    return { rate: marketValue, source: 'market' };
  }
  return { rate: null, source: null };
}

/**
 * The rate a blueprint bought from an LP Store prices its LP at: the pilot's
 * own LP Value when set, else free. A builder redeeming a blueprint spends LP
 * already earned, so with no rate of their own the plan charges only the cash
 * the store and its turn-ins take, never a market ISK/LP guess.
 */
export function blueprintLpRate(ownValue: number): LpRate {
  if (Number.isFinite(ownValue) && ownValue > 0) return { rate: ownValue, source: 'yours' };
  return { rate: 0, source: 'free' };
}
