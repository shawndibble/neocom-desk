/**
 * Abbreviated count formatting (e.g. skill points): "1.5K", "5.2M", "1.2B".
 * One fraction digit, whatever Intl's compact notation picks — enough to keep
 * a stat chip on one line without a second decimal it doesn't need.
 */
const formatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCompactNumber(value: number): string {
  return formatter.format(value);
}
