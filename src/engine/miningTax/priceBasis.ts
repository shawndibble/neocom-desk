import { shiftDate } from './yieldRange';

export type PriceBasis = 'buy' | 'sell' | 'now-buy' | 'now-sell';
export type PriceSide = 'buy' | 'sell';

export const PRICE_BASES: readonly PriceBasis[] = ['buy', 'sell', 'now-buy', 'now-sell'];

export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

export interface UnitPriceInputs {
  day?: SidePrices;
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
  return date >= shiftDate(today, -1) ? live : undefined;
}

export type TaxPriceSource = 'saved' | 'historical' | 'live' | 'live-sell' | 'none';

export interface TaxUnitPriceInputs {
  saved?: SidePrices;
  historical?: SidePrices;
  live?: SidePrices;
}

export interface ResolvedTaxPrice {
  price: number | undefined;
  source: TaxPriceSource;
}

export function resolveTaxUnitPrice(inputs: TaxUnitPriceInputs): ResolvedTaxPrice {
  const saved = sidePrice(inputs.saved, 'buy');
  if (saved !== undefined) return { price: saved, source: 'saved' };
  const historical = sidePrice(inputs.historical, 'buy');
  if (historical !== undefined) return { price: historical, source: 'historical' };
  const live = sidePrice(inputs.live, 'buy');
  if (live !== undefined) return { price: live, source: 'live' };
  const liveSell = sidePrice(inputs.live, 'sell');
  if (liveSell !== undefined) return { price: liveSell, source: 'live-sell' };
  return { price: undefined, source: 'none' };
}

export type SnapshotDay = Record<number, SidePrices>;

export function mergeSnapshotDay(existing: SnapshotDay, fresh: SnapshotDay): SnapshotDay {
  return { ...existing, ...fresh };
}
