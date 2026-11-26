import type { WalletTransactionCommon } from '@/esi/endpoints';
import type { JournalLine } from '@/engine/journalNetting';

export function journalTransactionLinks<
  T extends WalletTransactionCommon & { characterId?: number },
>(transactions: readonly T[]): (entry: JournalLine) => T | undefined {
  const scoped = (characterId: number | undefined, id: number) => `${characterId ?? ''}:${id}`;
  const byJournalRef = new Map<string, T>();
  const byTransactionId = new Map<string, T>();
  for (const txn of transactions) {
    byJournalRef.set(scoped(txn.characterId, txn.journal_ref_id), txn);
    byTransactionId.set(scoped(txn.characterId, txn.transaction_id), txn);
  }
  return (entry) =>
    byJournalRef.get(scoped(entry.characterId, entry.id)) ??
    (entry.context_id_type === 'market_transaction_id' && entry.context_id !== undefined
      ? byTransactionId.get(scoped(entry.characterId, entry.context_id))
      : undefined);
}
