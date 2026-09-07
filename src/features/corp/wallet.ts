/**
 * Fetch + cache layer for the corporation wallet (issue #298, #570).
 *
 * Four reads, because ESI splits the corp wallet four ways: the divisions and
 * their balances, the names the corp gave those divisions, one journal per
 * division, and one transaction list per division — there is no all-divisions
 * read of either, and the seven divisions are separately role-gated in game.
 *
 * Every key goes through `corpRead.ts`'s corp-scoped wrapper (issue #293), and
 * the two per-division keys carry the division as well: without it the seven
 * journals would overwrite each other in a single row and a division switch
 * would show the previous one's entries. A 403 is the in-game role gate, not a
 * re-login — see `corpAuthFailure.ts`.
 *
 * The two per-division reads paginate differently, which is ESI's doing rather
 * than a choice here: the journal is X-Pages, the transactions are cursored on
 * `from_id`. Both come back through `loadCorpPaginatedWithCacheStatus`, which
 * only asks for a `TruncatableResult`, so `truncated` means the same thing to
 * the view either way — "there is older history this list does not have".
 */
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
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

export const KEYS = {
  wallets: 'wallet:balances',
  divisions: 'divisions',
  /** Per division — see the module note. */
  journal: (division: number) => `wallet:journal:${division}`,
  /** Per division, for the same reason the journal's key is. */
  transactions: (division: number) => `wallet:transactions:${division}`,
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

/**
 * One division's market fills. `truncated` on the result means the cursor walk
 * stopped at its page cap, so older history is missing.
 */
export function loadCorporationWalletTransactions(
  characterId: number,
  corporationId: number,
  division: number
): Promise<StatusResult<CorporationWalletTransaction[]>> {
  return loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    KEYS.transactions(division),
    () => getCorporationWalletTransactions(characterId, corporationId, division)
  );
}
