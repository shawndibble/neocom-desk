import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { WalletTransaction } from '@/esi/endpoints';

/** Buys are money out, so the signed total is what carries the ISK tone. */
export function transactionTotal(txn: WalletTransaction): number {
  return txn.unit_price * txn.quantity * (txn.is_buy ? -1 : 1);
}

/**
 * CSV columns for wallet transactions: date, item, side, quantity, unit
 * price, total. Mirrors the DataTable columns on the Wallet page. `date`
 * passes through as the raw ISO string; `unitPrice`/`total` are raw numbers,
 * not `formatIsk` strings.
 */
export function walletTransactionsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeId: number) => string
): CsvColumn<WalletTransaction>[] {
  return [
    { header: t('wallet.date'), value: (txn) => txn.date },
    { header: t('wallet.item'), value: (txn) => nameFor(txn.type_id) },
    { header: t('wallet.side'), value: (txn) => t(txn.is_buy ? 'wallet.buy' : 'wallet.sell') },
    { header: t('wallet.quantity'), value: (txn) => txn.quantity },
    { header: t('wallet.unitPrice'), value: (txn) => txn.unit_price },
    { header: t('wallet.total'), value: (txn) => transactionTotal(txn) },
  ];
}
