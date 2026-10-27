/**
 * How the Mining Yield Overview prices a mined day (issue #1279).
 *
 * A mined-day basis values each day at that day's hub buy or sell price: the
 * server's end-of-day Open Prices (`hubSnapshot.ts`, published by
 * `syncMarketOpenPrices`; decision 20261019-091155). Today and yesterday,
 * before the job has published them, fall back to today's live price.
 *
 * The "now" bases skip all of that and value every day at today's live price.
 */
import { shiftDate } from './yieldRange';

export type PriceBasis = 'buy' | 'sell' | 'now-buy' | 'now-sell';
export type PriceSide = 'buy' | 'sell';

export const PRICE_BASES: readonly PriceBasis[] = ['buy', 'sell', 'now-buy', 'now-sell'];

/** One type's Jita book at one moment. Null = no orders on that side. */
export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

export interface UnitPriceInputs {
  /** The hub's end-of-day prices for the day, once published. */
  day?: SidePrices;
  /** Today's live book. */
  live?: SidePrices;
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

/** The day's price on `basis`, or undefined when there is none. */
export function resolveUnitPrice(
  inputs: UnitPriceInputs,
  basis: PriceBasis,
  date: string,
  today: string
): number | undefined {
  const side = basisSide(basis);
  const live = sidePrice(inputs.live, side);
  if (isNowBasis(basis)) return live;
  const day = sidePrice(inputs.day, side);
  if (day !== undefined) return day;
  // Only while the day is not published yet: an older day with no price is a
  // type that did not trade, not one waiting on the end-of-day job.
  return date >= shiftDate(today, -1) ? live : undefined;
}

export type TaxPriceSource = 'saved' | 'historical' | 'live' | 'live-sell' | 'none';

export interface TaxUnitPriceInputs {
  /** The hub station's end-of-day prices for the day. */
  saved?: SidePrices;
  /** Region-wide end-of-day prices. Nothing feeds this since #4293; the tier is kept for the engine's callers. */
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
 *   the hub station's buy that day → the region-wide buy that day →
 *   today's live buy → today's live sell (only when no buy side exists anywhere).
 *
 * Deliberately its own resolver rather than `resolveUnitPrice` with a fixed
 * `'buy'` basis: that function gates its `live` fallback to today/yesterday
 * (an older day with no price is a type that doesn't trade), which would
 * leave every such day unpriced. Tax keeps billing at today's live price for
 * it — the same number it billed before this tiered pricing existed, not a
 * new "unpriced" regression.
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

/** A day's saved prices, keyed by type id. */
export type SnapshotDay = Record<number, SidePrices>;

/** A later fetch on the same day overwrites each type it priced; types it did not price keep their earlier values. */
export function mergeSnapshotDay(existing: SnapshotDay, fresh: SnapshotDay): SnapshotDay {
  return { ...existing, ...fresh };
}
