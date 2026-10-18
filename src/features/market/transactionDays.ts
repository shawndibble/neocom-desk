/**
 * The phone Transactions list's Sold / Bought / Net strip.
 *
 * Pure: no fetch, no DOM. The day a fill falls on depends on the zone it is
 * read in, so the caller passes the viewer's Time format zone
 * (`useTimeZone`) — `undefined` is the host's own zone.
 */
import type { WalletTransactionCommon } from '@/esi/endpoints';

type DayRow = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'date' | 'is_buy' | 'quantity' | 'unit_price'
>;

export interface TransactionSummary {
  /** ISK taken in by sells. Positive. */
  sold: number;
  /** ISK paid out by buys. Positive — the sign lives in `net`. */
  bought: number;
  net: number;
  /** The span the figures cover — ESI only returns recent fills, so this is never a lifetime. */
  oldest: string | null;
  newest: string | null;
}

export function summarizeTransactions(rows: readonly DayRow[]): TransactionSummary {
  let sold = 0;
  let bought = 0;
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const row of rows) {
    const amount = row.unit_price * row.quantity;
    if (row.is_buy) bought += amount;
    else sold += amount;
    if (oldest === null || row.date < oldest) oldest = row.date;
    if (newest === null || row.date > newest) newest = row.date;
  }
  return { sold, bought, net: sold - bought, oldest, newest };
}
