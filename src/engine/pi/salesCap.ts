/**
 * How much of a product the hub's market takes from one pilot: a fixed share of
 * the hub region's daily volume (Industry's default sales share). Units past it
 * count as unsold in the plan's ISK, and the row says so. Unknown volume is no
 * cap and no flag, never a zero.
 */
import { DEFAULT_SALES_SHARE_PCT } from '@/engine/industry/iskPerDay';

/** The share the PI plans use; fixed, not a setting. */
export const PI_SALES_SHARE_PCT: number = DEFAULT_SALES_SHARE_PCT;

/** Units a day the hub absorbs at `sharePct` of `tradesPerDay`; undefined when volume is unknown. */
export function salesCapPerDay(
  tradesPerDay: number | undefined,
  sharePct: number = PI_SALES_SHARE_PCT
): number | undefined {
  return tradesPerDay === undefined ? undefined : (tradesPerDay * sharePct) / 100;
}

/** A product whose planned output is over the share the hub absorbs. */
export interface ThinSales {
  planPerDay: number;
  /** The hub region's units a day. */
  tradesPerDay: number;
  /** Units a day the plan's ISK counts. */
  countedPerDay: number;
  sharePct: number;
}

/** The exception flag's facts, or null when the output fits the share or the volume is unknown. */
export function thinSales(
  planPerDay: number,
  tradesPerDay: number | undefined,
  sharePct: number = PI_SALES_SHARE_PCT
): ThinSales | null {
  if (tradesPerDay === undefined) return null;
  const cap = salesCapPerDay(tradesPerDay, sharePct)!;
  if (planPerDay <= cap) return null;
  return { planPerDay, tradesPerDay, countedPerDay: cap, sharePct };
}
