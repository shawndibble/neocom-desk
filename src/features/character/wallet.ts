/** Fetch + cache layer for the Wallet view: balance, journal, transactions. */
import {
  getCharacterWallet,
  getCharacterWalletJournal,
  getCharacterWalletTransactions,
  type WalletJournalEntry,
  type WalletTransaction,
} from '@/esi/endpoints';
import { uniqueTransactions } from '@/esi/uniqueTransactions';
import {
  conditionalPagedFetch,
  conditionalFetch,
  loadWithCache,
  loadWithCacheStatus,
  loadPaginatedWithCache,
  loadPaginatedWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';

export const KEYS = {
  balance: 'wallet:balance',
  journal: 'wallet:journal',
  transactions: 'wallet:transactions',
} as const;

const WALLET_SCOPE = ESI_REGISTRY.getCharacterWallet.scope;

/** ISK balance. ESI or cache. */
export function loadWalletBalance(characterId: number): Promise<CachedResult<number> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterWallet(characterId, options)
  );
  return loadWithCache(characterId, KEYS.balance, fetchLive, { conditional });
}

/**
 * Same data as loadWalletBalance, with the auth-failure state exposed for views
 * that show a re-login affordance instead of a silent "offline" state.
 */
export function loadWalletBalanceWithStatus(characterId: number): Promise<StatusResult<number>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterWallet(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.balance, fetchLive, { conditional });
}

export interface CharacterWalletBalance {
  characterId: number;
  characterName: string;
  balanceResult: CachedResult<number> | null;
  /** Granted the wallet scope but the live read still failed auth — distinct from `skipped`, which never granted it at all. */
  needsReauth: boolean;
}

export interface WalletBalancesSnapshot {
  entries: CharacterWalletBalance[];
  /** Never granted the wallet scope — listed, never fetched (same policy as `openOrdersData.ts`). */
  skipped: { characterId: number; name: string }[];
}

/**
 * Every authenticated Character's wallet balance, for the Wallet page's
 * cross-character view (issue #607). Scope pre-check, skipping and ordering
 * live in `fanOutAllCharacters`. A Character WITH the scope whose live call
 * still answers `needsReauth` stays in `entries` (not `skipped`) so its row
 * can show its own re-auth prompt instead of the row simply vanishing.
 */
export function loadAllCharactersWalletBalances(): Promise<WalletBalancesSnapshot> {
  return fanOutAllCharacters<CharacterWalletBalance>({
    scope: WALLET_SCOPE,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
      return { characterId, characterName: name, balanceResult: cached, needsReauth };
    },
  });
}

/** Sum of every entry that actually has a usable balance — a needsReauth or never-fetched entry is simply absent from the total, not counted as zero. */
export function totalWalletBalance(entries: readonly CharacterWalletBalance[]): number {
  return entries.reduce(
    (sum, entry) =>
      entry.needsReauth || entry.balanceResult === null ? sum : sum + entry.balanceResult.data,
    0
  );
}

/** Journal. `truncated` on the result means pages were missing. */
export function loadWalletJournal(
  characterId: number
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterWalletJournal(characterId, options)
  );
  return loadPaginatedWithCache(characterId, KEYS.journal, fetchLive, { conditional });
}

/**
 * Same data as loadWalletJournal, with the auth-failure state exposed —
 * the Foreground Poller (features/notifications) needs to distinguish a
 * revoked scope from a transient offline failure the same way the other
 * pollable domains do (features/character/contracts.ts).
 */
export function loadWalletJournalWithStatus(
  characterId: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterWalletJournal(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEYS.journal, fetchLive, { conditional });
}

/** Whether the character granted the wallet scope — checked up front so callers never provoke a live 403. */
export async function hasWalletScope(characterId: number): Promise<boolean> {
  const token = await db.tokens.get(characterId);
  return (token?.scopes ?? []).includes(WALLET_SCOPE);
}

/** Transactions. `truncated` means the fetch stopped at the page cap. */
export async function loadWalletTransactions(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  const result = await loadPaginatedWithCache(characterId, KEYS.transactions, () =>
    getCharacterWalletTransactions(characterId)
  );
  return result && { ...result, data: uniqueTransactions(result.data) };
}

/**
 * Same data as loadWalletTransactions, with the auth-failure state exposed —
 * Market's Transactions view shows a Grant banner for a declined or revoked
 * Wallet Permission rather than a "reconnect" empty state (issue #2236).
 */
export async function loadWalletTransactionsWithStatus(
  characterId: number
): Promise<StatusResult<WalletTransaction[]>> {
  const { cached, needsReauth } = await loadPaginatedWithCacheStatus(
    characterId,
    KEYS.transactions,
    () => getCharacterWalletTransactions(characterId)
  );
  return {
    cached: cached && { ...cached, data: uniqueTransactions(cached.data) },
    needsReauth,
  };
}
