import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  fanOutAllCharacters,
  type FanOutCharacter,
} from '@/features/character/allCharactersFanOut';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  loadWalletJournalHistory,
  loadWalletTransactionsHistory,
} from '@/features/character/wallet';

const JOURNAL_SCOPE = ESI_REGISTRY.getCharacterWalletJournal.scope;

export interface CharacterJournal {
  characterId: number;
  name: string;
  journal: WalletJournalEntry[];
  transactions: WalletTransaction[];
  truncated: boolean;
  fillsTruncated: boolean;
  fetchedAt: Date;
}

export interface AllJournalsSnapshot {
  loaded: CharacterJournal[];
  skipped: FanOutCharacter[];
  typeNames: Map<number, string>;
}

export async function loadAllCharactersJournals(
  characters?: readonly FanOutCharacter[],
  options: { typeNames?: boolean; fills?: boolean } = {}
): Promise<AllJournalsSnapshot> {
  const { entries, skipped } = await fanOutAllCharacters<CharacterJournal>({
    scope: JOURNAL_SCOPE,
    characters,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadWalletJournalHistory(characterId);
      if (!cached || needsReauth) return null;
      const fills =
        options.fills === false
          ? null
          : await loadWalletTransactionsHistory(characterId).catch(() => null);
      return {
        characterId,
        name,
        journal: cached.data,
        transactions: fills?.data ?? [],
        truncated: cached.truncated ?? false,
        fillsTruncated: fills?.truncated ?? false,
        fetchedAt: cached.fetchedAt,
      };
    },
  });
  const typeIds = new Set(entries.flatMap((e) => e.transactions.map((txn) => txn.type_id)));
  const typeNames =
    options.typeNames === false ? new Map<number, string>() : await loadTypeNames([...typeIds]);
  return { loaded: entries, skipped, typeNames };
}

export async function loadWalletScopedCharacterIds(): Promise<number[]> {
  return characterIdsWithScopes([JOURNAL_SCOPE]);
}
