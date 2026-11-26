import { median } from '../math';

export const MIN_GOING_RATE_SAMPLE = 20;

export function corpusGoingRate(rates: readonly (number | null)[]): number | null {
  const stated = rates.filter((rate): rate is number => rate !== null).sort((a, b) => a - b);
  if (stated.length < MIN_GOING_RATE_SAMPLE) return null;
  return median(stated);
}

export function goingRateMultiple(rate: number | null, goingRate: number | null): number | null {
  if (rate === null || goingRate === null || !(goingRate > 0)) return null;
  return rate / goingRate;
}

export const FAR_ABOVE_MULTIPLE = 8;

export function paysFarAboveGoingRate(multiple: number | null): boolean {
  return multiple !== null && multiple >= FAR_ABOVE_MULTIPLE;
}

export function communityFloorReward(collateral: number, jumps: number | null): number | null {
  if (!(collateral > 0) || jumps === null) return null;
  return (collateral / 1_000_000_000) * Math.max(jumps, 1) * 1_000_000;
}

export function floorShare(reward: number, floor: number | null): number | null {
  if (floor === null || !(floor > 0)) return null;
  return reward / floor;
}
