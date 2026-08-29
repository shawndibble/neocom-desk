const ISK_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const PERCENT_FORMAT = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** Whole-ISK amount, thousands-separated (e.g. "1,234,567"). */
export function formatIsk(value: number): string {
  return ISK_FORMAT.format(value);
}

/** Percent with one decimal (e.g. "12.3%"). */
export function formatPercent(value: number): string {
  return `${PERCENT_FORMAT.format(value)}%`;
}

/** ESI system cost index (a 0..1 fraction) shown as a percent (e.g. "4.64%"). */
export function formatCostIndex(index: number): string {
  return `${(index * 100).toFixed(2)}%`;
}
