const SECONDS_PER_DAY = 86_400;

export const SALES_SHARE_PCTS = [5, 10, 25, 50] as const;
export type SalesSharePct = (typeof SALES_SHARE_PCTS)[number];
export const DEFAULT_SALES_SHARE_PCT: SalesSharePct = 10;

export interface IskPerDayInput {
  unitMargin: number | null;
  outputQuantity: number;
  jobSeconds: number;
  averageDailyVolume: number | null | undefined;
  sharePct: number;
}

export function iskPerDay(input: IskPerDayInput): number | null {
  const { unitMargin, outputQuantity, jobSeconds, averageDailyVolume, sharePct } = input;
  if (unitMargin === null || averageDailyVolume === null || averageDailyVolume === undefined) {
    return null;
  }
  if (jobSeconds <= 0 || averageDailyVolume <= 0) return null;
  const builtPerDay = outputQuantity * (SECONDS_PER_DAY / jobSeconds);
  if (unitMargin < 0) return unitMargin * builtPerDay;
  const sellablePerDay = averageDailyVolume * (sharePct / 100);
  return unitMargin * Math.min(builtPerDay, sellablePerDay);
}
