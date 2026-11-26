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
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import {
  archiveResult,
  journalWithArchive,
  transactionsWithArchive,
} from '@/features/character/walletArchive';
import { loadGrantedScopes } from '@/app/grantedScopes';

export const KEYS = {
  balance: 'wallet:balance',
  journal: 'wallet:journal',
  transactions: 'wallet:transactions',
} as const;

const WALLET_SCOPE = ESI_REGISTRY.getCharacterWallet.scope;

export function loadWalletBalance(characterId: number): Promise<CachedResult<number> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterWallet(characterId, options)
  );
  return loadWithCache(characterId, KEYS.balance, fetchLive, { conditional });
}

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
  needsReauth: boolean;
}

export interface WalletBalancesSnapshot {
  entries: CharacterWalletBalance[];
  skipped: { characterId: number; name: string }[];
}

export function loadAllCharactersWalletBalances(): Promise<WalletBalancesSnapshot> {
  return fanOutAllCharacters<CharacterWalletBalance>({
    scope: WALLET_SCOPE,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
      return { characterId, characterName: name, balanceResult: cached, needsReauth };
    },
  });
}

export function oldestCachedBalanceAt(
  entries: readonly CharacterWalletBalance[],
  characterIds: ReadonlySet<number>
): number | null {
  const times = entries.flatMap((entry) =>
    characterIds.has(entry.characterId) && entry.balanceResult?.fromCache
      ? [entry.balanceResult.fetchedAt.getTime()]
      : []
  );
  return times.length > 0 ? Math.min(...times) : null;
}

export async function loadWalletJournal(
  characterId: number,
  options: { archive?: boolean } = {}
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterWalletJournal(characterId, options)
  );
  const result = await loadPaginatedWithCache(characterId, KEYS.journal, fetchLive, {
    conditional,
  });
  const archived = await archiveResult('journal', characterId, result);
  return options.archive ? journalWithArchive(characterId, archived) : archived;
}

export async function loadWalletJournalWithStatus(
  characterId: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterWalletJournal(characterId, options)
  );
  const status = await loadPaginatedWithCacheStatus(characterId, KEYS.journal, fetchLive, {
    conditional,
  });
  await archiveResult('journal', characterId, status.cached);
  return status;
}

export async function loadWalletJournalHistory(
  characterId: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  const status = await loadWalletJournalWithStatus(characterId);
  return { ...status, cached: await journalWithArchive(characterId, status.cached) };
}

export async function hasWalletScope(characterId: number): Promise<boolean> {
  return (await loadGrantedScopes(characterId)).has(WALLET_SCOPE);
}

export async function loadWalletTransactions(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  const result = await loadPaginatedWithCache(characterId, KEYS.transactions, () =>
    getCharacterWalletTransactions(characterId)
  );
  await archiveResult('transactions', characterId, result);
  return result && { ...result, data: uniqueTransactions(result.data) };
}

export async function loadWalletTransactionsHistory(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  const result = await loadWalletTransactions(characterId);
  const merged = await transactionsWithArchive(characterId, result);
  return merged && { ...merged, data: uniqueTransactions(merged.data) };
}

export async function loadWalletTransactionsWithStatus(
  characterId: number,
  options: { archive?: boolean } = {}
): Promise<StatusResult<WalletTransaction[]>> {
  const { cached, needsReauth } = await loadPaginatedWithCacheStatus(
    characterId,
    KEYS.transactions,
    () => getCharacterWalletTransactions(characterId)
  );
  await archiveResult('transactions', characterId, cached);
  const live = cached && { ...cached, data: uniqueTransactions(cached.data) };
  const merged = options.archive ? await transactionsWithArchive(characterId, live) : live;
  return {
    cached: merged && { ...merged, data: uniqueTransactions(merged.data) },
    needsReauth,
  };
}
