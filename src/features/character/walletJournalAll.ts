/**
 * The Journal's "All characters" read (issue #3908): every tracked Character's
 * wallet journal and recent fills, fanned out through `fanOutAllCharacters`
 * (scope pre-check, ordering, concurrency). Kept apart from `wallet.ts`, which
 * holds the single-Character loaders.
 */
import { db } from '@/db';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  fanOutAllCharacters,
  type FanOutCharacter,
} from '@/features/character/allCharactersFanOut';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadWalletJournalWithStatus, loadWalletTransactions } from '@/features/character/wallet';

const JOURNAL_SCOPE = ESI_REGISTRY.getCharacterWalletJournal.scope;

export interface CharacterJournal {
  characterId: number;
  name: string;
  journal: WalletJournalEntry[];
  transactions: WalletTransaction[];
  /** Pages of the journal or of the fills were missing. */
  truncated: boolean;
}

export interface AllJournalsSnapshot {
  /** Characters whose journal loaded, in Character order. */
  loaded: CharacterJournal[];
  /** Tracked Characters with no wallet permission, or whose journal failed to load. */
  skipped: FanOutCharacter[];
  typeNames: Map<number, string>;
}

export async function loadAllCharactersJournals(): Promise<AllJournalsSnapshot> {
  const { entries, skipped } = await fanOutAllCharacters<CharacterJournal>({
    scope: JOURNAL_SCOPE,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadWalletJournalWithStatus(characterId);
      if (!cached || needsReauth) return null;
      // The fills only name PLEX lines and items: a failed read costs those, not the journal.
      const fills = await loadWalletTransactions(characterId).catch(() => null);
      return {
        characterId,
        name,
        journal: cached.data,
        transactions: fills?.data ?? [],
        truncated: cached.truncated ?? false,
      };
    },
  });
  const typeIds = new Set(entries.flatMap((e) => e.transactions.map((txn) => txn.type_id)));
  const typeNames = await loadTypeNames([...typeIds]);
  return { loaded: entries, skipped, typeNames };
}

/** Ids of the tracked Characters that granted the wallet permission. */
export async function loadWalletScopedCharacterIds(): Promise<number[]> {
  const tokens = await db.tokens.toArray();
  return tokens.filter((token) => token.scopes.includes(JOURNAL_SCOPE)).map((t) => t.characterId);
}
