export function percentDifference(value: number | null, base: number | null): number | null {
  if (value === null || base === null || !(base > 0)) return null;
  return Math.round(((value - base) / base) * 1000) / 10;
}

export function formatPercentDifference(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

export function shipFitValue(hull: number | null, fit: number | null): number | null {
  return hull === null || fit === null ? null : hull + fit;
}

export function repaymentHidden(repayment: number, shipAndFit: number | null): boolean {
  return shipAndFit !== null && repayment > shipAndFit;
}
