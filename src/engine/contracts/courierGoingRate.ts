/**
 * What a courier haul pays, measured against what the market pays (issue #946).
 *
 * The courier scams the player community documents share one signature, and it
 * is the opposite of what a new hauler expects: **the scam contracts pay
 * unusually well.** Over-payment is the bait. Ten to thirty million for a five
 * to ten jump route, or a hundred million for a short trip through lowsec, is
 * not a bargain others missed — it is priced to be accepted before it is
 * thought about.
 *
 * So the strongest available signal is a rate comparison, which is provable
 * arithmetic rather than an accusation. **Nothing here calls a contract a
 * scam.** The app cannot read intent, cannot value a courier contract's cargo
 * (it carries no item lines at all), and cannot know who can dock where. Every
 * figure below is one the snapshot supports; the player draws the conclusion.
 * Same rule the hauling scope decision set: state the figure, say plainly what
 * is not in it.
 *
 * Pure. The caller supplies the jump counts.
 */

/**
 * A reward normalised by both the size of the load and the length of the trip
 * — the corpus's own going rate is the median of this across every outstanding
 * public courier contract, so it must be a figure every row computes the same
 * way.
 *
 * `null` rather than a number for a haul that cannot state one: a courier
 * contract carries no item lines, so `volume: 0` is a figure the snapshot
 * genuinely holds rather than a divisor, and an unroutable or unplaced endpoint
 * has no jump count. A rate computed without distance is not the rate this
 * compares — the same `null`-not-`Infinity` discipline `courierRates.ts` keeps.
 */
export function rewardPerVolumeJump(
  reward: number,
  volume: number,
  jumps: number | null
): number | null {
  if (!(volume > 0) || jumps === null) return null;
  // Zero jumps is a real answer — both ends in one system — not a missing one,
  // and dividing by it would read as an infinite rate and top every outlier
  // list. `iskPerJump` already settled this convention; diverging would give
  // one row two different distances in two adjacent cells.
  return reward / (volume * Math.max(jumps, 1));
}

/**
 * How many rates a median needs before it means anything.
 *
 * A median over a handful of rows is arithmetically fine and statistically
 * meaningless, and this one decides whether a contract is called an outlier —
 * a claim adjacent enough to an accusation that it should not rest on three
 * samples. Below the floor the whole comparison degrades to showing nothing,
 * rather than calling every row several times the median of two.
 */
export const MIN_GOING_RATE_SAMPLE = 20;

/**
 * The market's own going rate: the median of what every outstanding public
 * courier contract pays per m³ per jump.
 *
 * Computed from the snapshot itself, with nothing assumed and nothing typed in.
 * Median rather than mean precisely because the outliers this exists to find
 * would drag a mean towards themselves.
 */
export function corpusGoingRate(rates: readonly (number | null)[]): number | null {
  const stated = rates.filter((rate): rate is number => rate !== null).sort((a, b) => a - b);
  if (stated.length < MIN_GOING_RATE_SAMPLE) return null;
  const middle = stated.length / 2;
  return stated.length % 2 === 1
    ? stated[Math.floor(middle)]
    : (stated[middle - 1] + stated[middle]) / 2;
}

/** How many times the going rate this haul pays, or `null` without both halves. */
export function goingRateMultiple(rate: number | null, goingRate: number | null): number | null {
  if (rate === null || goingRate === null || !(goingRate > 0)) return null;
  return rate / goingRate;
}

/**
 * Where "far above the going rate" starts.
 *
 * Derived from the ticket's own figures rather than picked round. On this
 * normaliser an honest short hop — 4M for 10,000 m³ over 3 jumps — already runs
 * about 3.6x the median of ordinary work, because a small parcel pays more per
 * cubic metre than a freighter load does. The documented bait sits an order
 * further out: 30M for 5,000 m³ over 8 jumps is ~20x, and 100M for a short
 * lowsec run is ~900x. Eight clears ordinary small-parcel work comfortably and
 * still catches the cheapest documented bait with room to spare.
 *
 * A threshold this side of the gap fails safe: a missed outlier costs a hauler
 * nothing they were not already exposed to, while a false one accuses ordinary
 * work.
 */
export const FAR_ABOVE_MULTIPLE = 8;

export function paysFarAboveGoingRate(multiple: number | null): boolean {
  return multiple !== null && multiple >= FAR_ABOVE_MULTIPLE;
}

/**
 * The haulers' guide benchmark: one million in reward per billion of collateral
 * per jump — 2 B over 10 jumps should pay at least 20 M.
 *
 * A floor for honest work, and read the other way a ceiling that the bait blows
 * past. Distinct from the corpus rate above because it prices *risk* rather
 * than *effort*: it is what the hauler is putting up, not what they are
 * carrying. A haul asking no collateral has nothing at risk, so the benchmark
 * that prices risk says nothing about it.
 */
export function communityFloorReward(collateral: number, jumps: number | null): number | null {
  if (!(collateral > 0) || jumps === null) return null;
  return (collateral / 1_000_000_000) * Math.max(jumps, 1) * 1_000_000;
}

/**
 * The volume above which a freighter is the only hull that will carry the load.
 *
 * A freighter is slow, cannot cloak and is the easiest gank target in the game,
 * so an oversized load on a route through lowsec is bait regardless of what it
 * pays — which the rate multiple alone cannot see. Checked against the ticket's
 * figures: a freighter-gank contract at 50M for 350,000 m³ over 5 jumps runs
 * *0.8x* the going rate, below the median rather than above it.
 */
export const FREIGHTER_VOLUME_M3 = 350_000;

export function forcesFreighter(volume: number): boolean {
  return volume > FREIGHTER_VOLUME_M3;
}

/** Whole hours a hauler has left to decide, floored at zero for a lapsed contract. */
export function hoursToExpiry(dateExpired: number, now: number): number {
  return Math.max(0, Math.floor((dateExpired - now) / 3_600_000));
}
