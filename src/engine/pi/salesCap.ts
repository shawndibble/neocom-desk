import { DEFAULT_SALES_SHARE_PCT } from '@/engine/industry/iskPerDay';

export const PI_SALES_SHARE_PCT: number = DEFAULT_SALES_SHARE_PCT;

export function salesCapPerDay(
  tradesPerDay: number | undefined,
  sharePct: number = PI_SALES_SHARE_PCT
): number | undefined {
  return tradesPerDay === undefined ? undefined : (tradesPerDay * sharePct) / 100;
}

export interface ThinSales {
  planPerDay: number;
  tradesPerDay: number;
  countedPerDay: number;
  sharePct: number;
}

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
