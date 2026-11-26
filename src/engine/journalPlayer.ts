import type { WalletJournalEntry } from '@/esi/endpoints/wallet';

export function journalPlayerId(
  entry: Pick<WalletJournalEntry, 'first_party_id' | 'second_party_id'>,
  isCharacter: (id: number) => boolean
): number | undefined {
  for (const id of [entry.first_party_id, entry.second_party_id]) {
    if (id !== undefined && isCharacter(id)) return id;
  }
  return undefined;
}
