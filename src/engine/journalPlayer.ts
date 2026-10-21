import type { WalletJournalEntry } from '@/esi/endpoints/wallet';

/**
 * The player behind a corporation journal line: the first of its two parties
 * that is a character. ESI has no "acting player" field; a corp line pairs the
 * player with the corporation (or another entity), so the character side is who
 * did it. Undefined when neither party is a character (corp-to-corp, system).
 */
export function journalPlayerId(
  entry: Pick<WalletJournalEntry, 'first_party_id' | 'second_party_id'>,
  isCharacter: (id: number) => boolean
): number | undefined {
  for (const id of [entry.first_party_id, entry.second_party_id]) {
    if (id !== undefined && isCharacter(id)) return id;
  }
  return undefined;
}
