/**
 * How the Mining Yield Overview prices a mined day (issue #1279).
 *
 * ESI's market history only has a daily *average* — a mix of buy- and
 * sell-side trades, neither the price a pilot gets selling into buy orders nor
 * the sell-order price — and no row at all for today. So the app saves its own
 * daily Jita buy/sell snapshot each time the Overview loads, and prices each
 * type on each day from the best source it has, in this order:
 *
 *   saved snapshot for that day → Adam4EVE's historical buy/sell split →
 *   ESI daily average → today's live price (the last only for today and
 *   yesterday, before ESI has published them).
 *
 * The "now" bases skip all of that and value every day at today's live price.
 *
 * `historical` (issue #1279 follow-up) is a real buy/sell split, unlike the
 * blended ESI average, but region-wide rather than station-level (Adam4EVE's
 * `market_price_history` has no station filter) — weaker than `saved`
 * (station-exact) and `live` (station-exact, just the wrong day), stronger
 * than `average` (not even the right side of the book). It only ever covers a
 * day the server's own hub-price job (`functions/src/marketSnapshot.ts`)
 * hadn't captured live yet — a one-time backfill that runs itself out of work
 * once that job has covered the retention window.
 */
import { shiftDate } from './yieldRange';
import { LEDGER_HISTORY_DAYS } from './ledgerHistory';

export type PriceBasis = 'buy' | 'sell' | 'now-buy' | 'now-sell';
export type PriceSide = 'buy' | 'sell';
export type PriceSource = 'saved' | 'historical' | 'average' | 'live' | 'none';

export const PRICE_BASES: readonly PriceBasis[] = ['buy', 'sell', 'now-buy', 'now-sell'];

/** One type's Jita book at one moment. Null = no orders on that side. */
export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

export interface UnitPriceInputs {
  /** This app's saved snapshot for the day, if one was taken. */
  saved?: SidePrices;
  /** Adam4EVE's region-wide historical buy/sell split for the day, if the server ever had to backfill it. */
  historical?: SidePrices;
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
  const historical = sidePrice(inputs.historical, side);
  if (historical !== undefined) return { price: historical, source: 'historical' };
  if (inputs.average !== undefined) return { price: inputs.average, source: 'average' };
  // Only while ESI has not published the day yet: an older day with no
  // history is a type that does not trade, not one waiting on downtime.
  if (live !== undefined && date >= shiftDate(today, -1)) return { price: live, source: 'live' };
  return { price: undefined, source: 'none' };
}

export type TaxPriceSource = 'saved' | 'historical' | 'live' | 'live-sell' | 'none';

export interface TaxUnitPriceInputs {
  /** This app's saved snapshot for the day, if one was taken. */
  saved?: SidePrices;
  /** Adam4EVE's region-wide historical buy/sell split for the day, if the server ever had to backfill it. */
  historical?: SidePrices;
  /** Today's live book. */
  live?: SidePrices;
}

export interface ResolvedTaxPrice {
  price: number | undefined;
  source: TaxPriceSource;
}

/**
 * How the Moon Mining Tax ledger prices a mined day's ore (issue #523 follow-up):
 * buy side only — Tax has never had a basis selector, it bills at what a
 * Payee would actually get selling into buy orders — in this order:
 *
 *   saved snapshot for that day → Adam4EVE's historical buy split →
 *   today's live buy → today's live sell (only when no buy side exists anywhere).
 *
 * Deliberately its own resolver rather than `resolveUnitPrice` with a fixed
 * `'buy'` basis: that function gates its `live` fallback to today/yesterday
 * (an older day with no ESI history is a type that doesn't trade), which
 * would leave every older, never-captured day unpriced. Tax has no ESI
 * `average` tier to fall to first, so it keeps billing at today's live price
 * for any such day — the same number it billed before this tiered pricing
 * existed, not a new "unpriced" regression.
 */
export function resolveTaxUnitPrice(inputs: TaxUnitPriceInputs): ResolvedTaxPrice {
  const saved = sidePrice(inputs.saved, 'buy');
  if (saved !== undefined) return { price: saved, source: 'saved' };
  const historical = sidePrice(inputs.historical, 'buy');
  if (historical !== undefined) return { price: historical, source: 'historical' };
  const live = sidePrice(inputs.live, 'buy');
  if (live !== undefined) return { price: live, source: 'live' };
  // Last resort: an ore nobody bids on (thin compressed moon ore at Jita) is
  // still worth roughly its ask. Better than billing 0 — the caller flags the
  // type so the pilot knows the figure is a sell-side estimate.
  const liveSell = sidePrice(inputs.live, 'sell');
  if (liveSell !== undefined) return { price: liveSell, source: 'live-sell' };
  return { price: undefined, source: 'none' };
}

const SOURCE_RANK: Record<Exclude<PriceSource, 'none'>, number> = {
  saved: 0,
  live: 1,
  historical: 2,
  average: 3,
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
  historical: number;
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
  const counts: DaysBySource = {
    total: byDate.size,
    saved: 0,
    historical: 0,
    average: 0,
    live: 0,
    none: 0,
  };
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
