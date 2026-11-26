import { BASE_STATION_REPROCESSING_RATE } from './reprocessing';

export interface RefiningSetup {
  stationRate: number;
  taxRate: number;
}

export const DEFAULT_REFINING_SETUP: RefiningSetup = {
  stationRate: BASE_STATION_REPROCESSING_RATE,
  taxRate: 0,
};

export function resolveRefiningSetup(input: { yieldRate: number; taxRate: number }): RefiningSetup {
  const stationRate =
    Number.isFinite(input.yieldRate) && input.yieldRate > 0
      ? input.yieldRate
      : BASE_STATION_REPROCESSING_RATE;
  const taxRate = Number.isFinite(input.taxRate) ? Math.min(1, Math.max(0, input.taxRate)) : 0;
  return { stationRate, taxRate };
}

export function facilityBaseYieldFor(totalYield: number, skillsMultiplier: number): number | null {
  if (!(skillsMultiplier > 0) || !Number.isFinite(totalYield)) return null;
  return Math.round((totalYield / skillsMultiplier) * 10_000) / 10_000;
}

export function reprocessingTaxOn(
  quantities: Readonly<Record<number, number>>,
  prices: Readonly<Record<number, number>>,
  taxRate: number
): number {
  let value = 0;
  for (const [typeId, quantity] of Object.entries(quantities)) {
    value += quantity * (prices[Number(typeId)] ?? 0);
  }
  return value * taxRate;
}

export function netOfReprocessingTax(value: number, taxRate: number): number {
  return value * (1 - taxRate);
}
