/** Fetch + cache layer for the Wallet view: balance, journal, transactions. */
import {
  getCharacterWallet,
  getCharacterWalletJournal,
  getCharacterWalletTransactions,
  type WalletJournalEntry,
  type WalletTransaction,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  loadPaginatedWithCache,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

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

/**
 * Same data as loadWalletBalance, with the auth-failure state exposed for views
 * that show a re-login affordance instead of a silent "offline" state.
 */
export function loadWalletBalanceWithStatus(characterId: number): Promise<StatusResult<number>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.balance,
    async () => (await getCharacterWallet(characterId)).data
  );
}

/** Journal. `truncated` on the result means pages were missing. */
export function loadWalletJournal(
  characterId: number
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  return loadPaginatedWithCache(characterId, KEYS.journal, () =>
    getCharacterWalletJournal(characterId)
  );
}

/** Transactions. `truncated` means the fetch stopped at the page cap. */
export function loadWalletTransactions(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  return loadPaginatedWithCache(characterId, KEYS.transactions, () =>
    getCharacterWalletTransactions(characterId)
  );
}
