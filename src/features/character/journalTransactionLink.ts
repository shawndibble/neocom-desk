/**
 * Ties a wallet journal line to the market fill behind it, so the journal can
 * name the item a `market_transaction` bought or sold.
 *
 * Two keys, both exact: a transaction's `journal_ref_id` names its journal
 * line, and a journal line whose context is a `market_transaction_id` names
 * its transaction. Keyed on the data rather than on a list of ref types, so a
 * line such as `transaction_tax` links when ESI gives it that context and
 * quietly doesn't when it doesn't. Market escrow and broker fees carry no such
 * key, so they stay unlinked rather than guessed at.
 *
 * Transactions are capped at a few pages while the journal is not, so an
 * older journal line simply finds nothing.
 */
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';

export function journalTransactionLinks<T extends WalletTransactionCommon>(
  transactions: readonly T[]
): (entry: WalletJournalEntry) => T | undefined {
  const byJournalRef = new Map<number, T>();
  const byTransactionId = new Map<number, T>();
  for (const txn of transactions) {
    byJournalRef.set(txn.journal_ref_id, txn);
    byTransactionId.set(txn.transaction_id, txn);
  }
  return (entry) =>
    byJournalRef.get(entry.id) ??
    (entry.context_id_type === 'market_transaction_id' && entry.context_id !== undefined
      ? byTransactionId.get(entry.context_id)
      : undefined);
}
