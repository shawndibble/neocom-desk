/**
 * The Transactions table's Margin column (issue #1740): wires the wallet's
 * fills and journal into the pure `realizedMargins` engine. A sale's sales
 * tax is its `transaction_tax` journal line, tied to the fill by
 * `journalTransactionLinks`; the journal reaching back further than the
 * capped transactions (or not loading at all) just leaves sales without one,
 * so without a margin.
 */
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
import { realizedMargins, type RealizedMargin } from '@/engine/market/realizedMargin';

export function transactionMargins(
  transactions: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[]
): Map<number, RealizedMargin> {
  const linkFor = journalTransactionLinks(transactions);
  const salesTax = new Map<number, number>();
  for (const entry of journal) {
    if (entry.ref_type !== 'transaction_tax' || entry.amount === undefined) continue;
    const txn = linkFor(entry);
    if (!txn || txn.is_buy) continue;
    salesTax.set(
      txn.transaction_id,
      (salesTax.get(txn.transaction_id) ?? 0) + Math.abs(entry.amount)
    );
  }
  return realizedMargins(
    transactions.map((t) => ({
      transactionId: t.transaction_id,
      date: t.date,
      typeId: t.type_id,
      quantity: t.quantity,
      unitPrice: t.unit_price,
      isBuy: t.is_buy,
      isPersonal: t.is_personal,
    })),
    salesTax
  );
}
