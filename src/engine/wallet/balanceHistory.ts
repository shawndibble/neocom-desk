/**
 * Wallet-journal reduction: turns raw journal entries into a chronological
 * balance-over-time series. Pure — callers adapt the ESI response shape at
 * the boundary. ESI documents no ordering guarantee for
 * `/characters/{id}/wallet/journal`.
 */

export interface WalletBalanceEntry {
  date: string;
  balance?: number;
}

export interface WalletBalancePoint {
  date: string;
  balance: number;
}

/**
 * Sorts by date ascending, oldest first, dropping any entry missing
 * `balance` — ESI omits it for some ref types, and coercing that to zero
 * would plot a fake balance-wipe rather than just skip the point.
 */
export function walletBalanceHistory(entries: readonly WalletBalanceEntry[]): WalletBalancePoint[] {
  return entries
    .filter(
      (entry): entry is WalletBalanceEntry & { balance: number } =>
        typeof entry.balance === 'number'
    )
    .map((entry) => ({ date: entry.date, balance: entry.balance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type WalletBalanceTrend = 'up' | 'down' | 'flat';

/** First point vs. last point — the line's overall direction, for trend-coloring the chart. */
export function walletBalanceTrend(points: readonly WalletBalancePoint[]): WalletBalanceTrend {
  if (points.length < 2) return 'flat';
  const delta = points[points.length - 1].balance - points[0].balance;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}
