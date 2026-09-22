/**
 * The phone Transactions list's day groups and its Sold / Bought / Net strip.
 *
 * Pure: no fetch, no DOM. The day a fill falls on depends on the zone it is
 * read in, so the caller passes the viewer's Time format zone
 * (`useTimeZone`) — `undefined` is the host's own zone.
 */
import { transactionTotal } from '@/features/character/walletTransactionsCsv';
import type { WalletTransactionCommon } from '@/esi/endpoints';

type DayRow = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'date' | 'is_buy' | 'quantity' | 'unit_price'
>;

export interface TransactionDay<T> {
  /** `YYYY-MM-DD` in the given zone. A key, not display text. */
  dayKey: string;
  /** Signed ISK moved that day: sells add, buys subtract. */
  net: number;
  rows: T[];
}

/** `en-CA` for a sortable `YYYY-MM-DD`. Built per call so a test toggling TZ re-resolves. */
function dayKeyOf(date: string, timeZone: string | undefined): string {
  return new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  });
}

/**
 * Consecutive runs of one day, in input order. The caller sorts; a day that
 * recurs out of order starts a new group rather than pulling rows forward,
 * so this never reorders what the reader chose.
 */
export function groupTransactionsByDay<T extends DayRow>(
  rows: readonly T[],
  timeZone: string | undefined
): TransactionDay<T>[] {
  const days: TransactionDay<T>[] = [];
  for (const row of rows) {
    const dayKey = dayKeyOf(row.date, timeZone);
    let day = days.at(-1);
    if (day?.dayKey !== dayKey) {
      day = { dayKey, net: 0, rows: [] };
      days.push(day);
    }
    day.rows.push(row);
    day.net += transactionTotal(row);
  }
  return days;
}

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
