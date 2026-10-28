/** SRP appraisal comparisons (issue #5379). Pure: no fetch/DOM/Dexie. */

/** `value` against `base` as a percent, rounded to one decimal; null when either is unknown or base is not positive. */
export function percentDifference(value: number | null, base: number | null): number | null {
  if (value === null || base === null || !(base > 0)) return null;
  return Math.round(((value - base) / base) * 1000) / 10;
}

/** `+12.4%`, `-8.0%`, `0.0%`. */
export function formatPercentDifference(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/** The Jita value of a lost ship and its fit, no cargo; null unless both parts are priced. */
export function shipFitValue(hull: number | null, fit: number | null): number | null {
  return hull === null || fit === null ? null : hull + fit;
}

/**
 * The pilot is not shown a repayment that exceeds what the ship and fit were worth (equal is
 * shown); an officer reviews the claim instead. With no value to compare, it is shown.
 */
export function repaymentHidden(repayment: number, shipAndFit: number | null): boolean {
  return shipAndFit !== null && repayment > shipAndFit;
}
