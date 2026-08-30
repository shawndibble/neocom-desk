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
 * Same data as loadWalletBalance, but with the auth-failure state exposed
 * (BUG #3) for views that show a re-login affordance instead of a silent
 * "offline" state.
 */
export function loadWalletBalanceWithStatus(characterId: number): Promise<StatusResult<number>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.balance,
    async () => (await getCharacterWallet(characterId)).data
  );
}

/**
 * D4: a cached list plus whether the live fetch behind it came up short.
 * Same shape idea as `StatusResult` (data + the one bit the caller can't
 * recover on its own). `truncated` describes the fetch this call made, so it
 * is only ever true for a fresh response — a cache hit has no page count to
 * compare against.
 */
export interface TruncatableCachedResult<T> {
  cached: CachedResult<T> | null;
  truncated: boolean;
}

/** Journal, plus whether pages were missing from the fetch (D4). */
export async function loadWalletJournalWithStatus(
  characterId: number
): Promise<TruncatableCachedResult<WalletJournalEntry[]>> {
  let truncated = false;
  const cached = await loadWithCache(
    characterId,
    KEYS.journal,
    async () => {
      const result = await getCharacterWalletJournal(characterId);
      truncated = result.truncated;
      return result.items;
    },
    { persistResult: () => !truncated }
  );
  return { cached, truncated };
}

/** Transactions, plus whether the fetch stopped at the page cap (D4). */
export async function loadWalletTransactionsWithStatus(
  characterId: number
): Promise<TruncatableCachedResult<WalletTransaction[]>> {
  let truncated = false;
  const cached = await loadWithCache(
    characterId,
    KEYS.transactions,
    async () => {
      const result = await getCharacterWalletTransactions(characterId);
      truncated = result.truncated;
      return result.items;
    },
    { persistResult: () => !truncated }
  );
  return { cached, truncated };
}
