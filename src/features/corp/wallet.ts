import { conditionalPagedFetch, conditionalFetch } from '@/esi/cache';
import {
  getCorporationDivisions,
  getCorporationWalletJournal,
  getCorporationWalletTransactions,
  getCorporationWallets,
  type CorporationDivisions,
  type CorporationWalletDivision,
  type CorporationWalletTransaction,
  type WalletJournalEntry,
} from '@/esi/endpoints';
import { uniqueTransactions } from '@/esi/uniqueTransactions';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

export const KEYS = {
  wallets: 'wallet:balances',
  divisions: 'divisions',
  journal: (division: number) => `wallet:journal:${division}`,
  transactions: (division: number) => `wallet:transactions:${division}`,
} as const;

export function loadCorporationWallets(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationWalletDivision[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationWallets(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.wallets, fetchLive, {
    conditional,
  });
}

export async function loadCorporationDivisions(
  characterId: number,
  corporationId: number,
  canReadDivisions: boolean
): Promise<StatusResult<CorporationDivisions>> {
  if (!canReadDivisions) return { cached: null, needsReauth: false };
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationDivisions(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.divisions, fetchLive, {
    conditional,
  });
}

export function loadCorporationWalletJournal(
  characterId: number,
  corporationId: number,
  division: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationWalletJournal(characterId, corporationId, division, options)
  );
  return loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    KEYS.journal(division),
    fetchLive,
    { conditional }
  );
}

export async function loadCorporationWalletTransactions(
  characterId: number,
  corporationId: number,
  division: number
): Promise<StatusResult<CorporationWalletTransaction[]>> {
  const result = await loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    KEYS.transactions(division),
    () => getCorporationWalletTransactions(characterId, corporationId, division)
  );
  const cached = result.cached && {
    ...result.cached,
    data: uniqueTransactions(result.cached.data),
  };
  return { ...result, cached };
}
