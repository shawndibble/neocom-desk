/**
 * How the Mining Yield Overview prices a mined day (issue #1279).
 *
 * ESI's market history only has a daily *average* — a mix of buy- and
 * sell-side trades, neither the price a pilot gets selling into buy orders nor
 * the sell-order price — and no row at all for today. So the app saves its own
 * daily Jita buy/sell snapshot each time the Overview loads, and prices each
 * type on each day from the best source it has, in this order:
 *
 *   saved snapshot for that day → ESI daily average → today's live price
 *   (the last only for today and yesterday, before ESI has published them).
 *
 * The "now" bases skip all of that and value every day at today's live price.
 */
import { shiftDate } from './yieldRange';
import { LEDGER_HISTORY_DAYS } from './ledgerHistory';

export type PriceBasis = 'buy' | 'sell' | 'now-buy' | 'now-sell';
export type PriceSide = 'buy' | 'sell';
export type PriceSource = 'saved' | 'average' | 'live' | 'none';

export const PRICE_BASES: readonly PriceBasis[] = ['buy', 'sell', 'now-buy', 'now-sell'];

/** One type's Jita book at one moment. Null = no orders on that side. */
export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

export interface UnitPriceInputs {
  /** This app's saved snapshot for the day, if one was taken. */
  saved?: SidePrices;
  /** ESI market history's daily average for the day. */
  average?: number;
  /** Today's live book. */
  live?: SidePrices;
}

export interface ResolvedPrice {
  price: number | undefined;
  source: PriceSource;
}

export function basisSide(basis: PriceBasis): PriceSide {
  return basis === 'sell' || basis === 'now-sell' ? 'sell' : 'buy';
}

export function isNowBasis(basis: PriceBasis): boolean {
  return basis === 'now-buy' || basis === 'now-sell';
}

function sidePrice(prices: SidePrices | undefined, side: PriceSide): number | undefined {
  const value = prices?.[side];
  return value !== null && value !== undefined && value > 0 ? value : undefined;
}

export function resolveUnitPrice(
  inputs: UnitPriceInputs,
  basis: PriceBasis,
  date: string,
  today: string
): ResolvedPrice {
  const side = basisSide(basis);
  const live = sidePrice(inputs.live, side);
  if (isNowBasis(basis)) {
    return live !== undefined
      ? { price: live, source: 'live' }
      : { price: undefined, source: 'none' };
  }
  const saved = sidePrice(inputs.saved, side);
  if (saved !== undefined) return { price: saved, source: 'saved' };
  if (inputs.average !== undefined) return { price: inputs.average, source: 'average' };
  // Only while ESI has not published the day yet: an older day with no
  // history is a type that does not trade, not one waiting on downtime.
  if (live !== undefined && date >= shiftDate(today, -1)) return { price: live, source: 'live' };
  return { price: undefined, source: 'none' };
}

const SOURCE_RANK: Record<Exclude<PriceSource, 'none'>, number> = {
  saved: 0,
  live: 1,
  average: 2,
};

/**
 * The least certain source among `sources`, for a row's or a day's tag: a
 * daily average is not the side the pilot chose at all, a live price is the
 * right side but not the day's. Unpriced lines are ignored — `pricedAll` is
 * what reports those.
 */
export function weakestSource(sources: readonly PriceSource[]): PriceSource {
  let weakest: PriceSource = 'none';
  for (const source of sources) {
    if (source === 'none') continue;
    if (weakest === 'none' || SOURCE_RANK[source] > SOURCE_RANK[weakest]) weakest = source;
  }
  return weakest;
}

export interface DaysBySource {
  total: number;
  saved: number;
  average: number;
  live: number;
  none: number;
}

export function countDaysBySource(
  rows: readonly { date: string; source: PriceSource }[]
): DaysBySource {
  const byDate = new Map<string, PriceSource[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row.source);
    byDate.set(row.date, list);
  }
  const counts: DaysBySource = { total: byDate.size, saved: 0, average: 0, live: 0, none: 0 };
  for (const sources of byDate.values()) counts[weakestSource(sources)] += 1;
  return counts;
}

/** A day's saved prices, keyed by type id. */
export type SnapshotDay = Record<number, SidePrices>;

/** A later fetch on the same day overwrites each type it priced; types it did not price keep their earlier values. */
export function mergeSnapshotDay(existing: SnapshotDay, fresh: SnapshotDay): SnapshotDay {
  return { ...existing, ...fresh };
}

/** Saved days older than the 90-day window ending today — the ones to delete. */
export function prunePriceSnapshotDates(dates: readonly string[], today: string): string[] {
  const cutoff = shiftDate(today, -(LEDGER_HISTORY_DAYS - 1));
  return dates.filter((date) => date < cutoff);
}
