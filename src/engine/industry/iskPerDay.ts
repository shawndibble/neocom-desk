/**
 * Realistic ISK/day for a product: what one job slot running continuously
 * earns, capped by how much of the market the pilot can plausibly sell. ISK/hour
 * assumes the market absorbs every unit built; for a thin product it doesn't.
 * Pure.
 */

const SECONDS_PER_DAY = 86_400;

/** The share-of-daily-volume options, in percent. */
export const SALES_SHARE_PCTS = [5, 10, 25, 50] as const;
export type SalesSharePct = (typeof SALES_SHARE_PCTS)[number];
export const DEFAULT_SALES_SHARE_PCT: SalesSharePct = 10;

export interface IskPerDayInput {
  /** Net profit per unit sold; null when unknown. */
  unitMargin: number | null;
  /** Units one job yields. */
  outputQuantity: number;
  /** One job's duration; the same basis as ISK/hour. */
  jobSeconds: number;
  /** Units traded a day across the trade-hub regions; null/undefined when unread. */
  averageDailyVolume: number | null | undefined;
  /** The share of that volume the pilot is assumed to sell, in percent. */
  sharePct: number;
}

/**
 * unitMargin × min(units built a day, units sellable a day). A negative margin
 * is not capped: building at a loss loses on every unit built. Null where any
 * input is unknown or the volume is 0: no figure beats a guessed one.
 */
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
