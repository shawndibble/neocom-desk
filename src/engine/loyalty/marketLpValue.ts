import { upperMedian } from '../math';

export interface LpValueCandidate {
  iskPerLp: number | null;
  sellVolume: number;
  quantity: number;
  soldPerDay: number | null;
}

export const MIN_DEPTH_REDEMPTIONS = 5;
export const MIN_SOLD_PER_DAY = 1;
const TOP_OFFERS = 5;
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
  rate: number | null;
  source: 'yours' | 'market' | 'free' | null;
}

export function lpRate(ownValue: number, marketValue: number | null): LpRate {
  if (Number.isFinite(ownValue) && ownValue > 0) return { rate: ownValue, source: 'yours' };
  if (marketValue !== null && Number.isFinite(marketValue) && marketValue > 0) {
    return { rate: marketValue, source: 'market' };
  }
  return { rate: null, source: null };
}

export function blueprintLpRate(ownValue: number): LpRate {
  if (Number.isFinite(ownValue) && ownValue > 0) return { rate: ownValue, source: 'yours' };
  return { rate: 0, source: 'free' };
}
