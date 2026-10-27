/**
 * The Journal's multi-Character read (issue #3908): the picked Characters'
 * wallet journals and recent fills, fanned out through `fanOutAllCharacters`
 * (scope pre-check, ordering, concurrency). Kept apart from `wallet.ts`, which
 * holds the single-Character loaders.
 */
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
  /** Pages of the journal were missing. */
  truncated: boolean;
  /** Pages of the fills were missing: some item names are unresolved. */
  fillsTruncated: boolean;
  fetchedAt: Date;
}

export interface AllJournalsSnapshot {
  /** Characters whose journal loaded, in Character order. */
  loaded: CharacterJournal[];
  /** Tracked Characters with no wallet permission, or whose journal failed to load. */
  skipped: FanOutCharacter[];
  typeNames: Map<number, string>;
}

/**
 * `characters` is the pick; omitted, every stored Character. `typeNames: false`
 * skips resolving item names (an empty map), for a reader of amounts only.
 */
export async function loadAllCharactersJournals(
  characters?: readonly FanOutCharacter[],
  options: { typeNames?: boolean } = {}
): Promise<AllJournalsSnapshot> {
  const { entries, skipped } = await fanOutAllCharacters<CharacterJournal>({
    scope: JOURNAL_SCOPE,
    characters,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadWalletJournalHistory(characterId);
      if (!cached || needsReauth) return null;
      // The fills only name PLEX lines and items: a failed read costs those, not the journal.
      const fills = await loadWalletTransactionsHistory(characterId).catch(() => null);
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

/** Ids of the tracked Characters that granted the wallet permission. */
export async function loadWalletScopedCharacterIds(): Promise<number[]> {
  return characterIdsWithScopes([JOURNAL_SCOPE]);
}
