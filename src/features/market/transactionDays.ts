import type { WalletTransactionCommon } from '@/esi/endpoints';

type DayRow = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'date' | 'is_buy' | 'quantity' | 'unit_price'
>;

export interface TransactionSummary {
  sold: number;
  bought: number;
  net: number;
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
