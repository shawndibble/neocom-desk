/** Display helpers shared by the Character views (wallet, assets, contracts, orders). */

const ISK_FORMAT = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ISK amount with 2 decimals, thousands-separated (e.g. "1,234,567.89"). */
export function formatIsk(value: number): string {
  return ISK_FORMAT.format(value);
}

/** Tailwind text color token for a signed ISK amount (journal entries, profit/loss). */
export function iskToneClass(value: number): string {
  return value < 0 ? 'text-isk-neg' : 'text-isk-pos';
}
