/** Fetch + cache layer for the Wallet view: balance, journal, transactions. */
import {
  getCharacterWallet,
  getCharacterWalletJournal,
  getCharacterWalletTransactions,
  type WalletJournalEntry,
  type WalletTransaction,
} from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from './cache';

const KEYS = {
  balance: 'wallet:balance',
  journal: 'wallet:journal',
  transactions: 'wallet:transactions',
} as const;

/** ISK balance. ESI or cache. */
export function loadWalletBalance(characterId: number): Promise<CachedResult<number> | null> {
  return loadWithCache(
    characterId,
    KEYS.balance,
    async () => (await getCharacterWallet(characterId)).data
  );
}

/** Wallet journal entries (every page). ESI or cache. */
export function loadWalletJournal(
  characterId: number
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  return loadWithCache(characterId, KEYS.journal, () => getCharacterWalletJournal(characterId));
}

/** Recent wallet transactions (cursor-followed, see esi/endpoints.ts). ESI or cache. */
export function loadWalletTransactions(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  return loadWithCache(characterId, KEYS.transactions, () =>
    getCharacterWalletTransactions(characterId)
  );
}
