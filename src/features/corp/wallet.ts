/**
 * Fetch + cache layer for the corporation wallet (issue #298).
 *
 * Three reads, because ESI splits the corp wallet three ways: the divisions
 * and their balances, the names the corp gave those divisions, and one
 * journal per division — there is no all-divisions journal, and the seven are
 * separately role-gated in game.
 *
 * Every key goes through `corpRead.ts`'s corp-scoped wrapper (issue #293), and
 * the journal's key carries the division as well: without it the seven
 * journals would overwrite each other in a single row and a division switch
 * would show the previous one's entries. A 403 is the in-game role gate, not a
 * re-login — see `corpAuthFailure.ts`.
 *
 * Note what is *not* here: ESI publishes a corp wallet *transactions* endpoint,
 * but #295 registered only the journal, and `esi/scopes.ts` derives everything
 * from `ESI_REGISTRY`. So the corp side of Wallet has no transactions tab, and
 * that is a registry fact rather than a layout choice.
 */
import {
  getCorporationDivisions,
  getCorporationWalletJournal,
  getCorporationWallets,
  type CorporationDivisions,
  type CorporationWalletDivision,
  type WalletJournalEntry,
} from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

export const KEYS = {
  wallets: 'wallet:balances',
  divisions: 'divisions',
  /** Per division — see the module note. */
  journal: (division: number) => `wallet:journal:${division}`,
} as const;

/** The corporation's seven wallet divisions and their balances. */
export function loadCorporationWallets(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationWalletDivision[]>> {
  return loadCorpWithCacheStatus(
    characterId,
    corporationId,
    KEYS.wallets,
    async () => (await getCorporationWallets(characterId, corporationId)).data
  );
}

/** The names the corporation gave its hangar and wallet divisions. */
export function loadCorporationDivisions(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationDivisions>> {
  return loadCorpWithCacheStatus(
    characterId,
    corporationId,
    KEYS.divisions,
    async () => (await getCorporationDivisions(characterId, corporationId)).data
  );
}

/** One division's journal. `truncated` on the result means pages were missing. */
export function loadCorporationWalletJournal(
  characterId: number,
  corporationId: number,
  division: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEYS.journal(division), () =>
    getCorporationWalletJournal(characterId, corporationId, division)
  );
}
