/**
 * Item lines on one public contract, fetched when its detail modal opens —
 * the same "read live on open" shape the character Contracts page uses
 * (`features/character/contractItems.ts`), against the public route instead.
 *
 * Cached under `GLOBAL_CACHE_CHARACTER_ID`, not the viewing character: a
 * public contract belongs to no character here, and twenty alts opening the
 * same contract should read one cached row rather than twenty.
 */
import { EsiError } from '@/esi/client';
import { getPublicContractItems, type PublicContractItem } from '@/esi/endpoints';
import {
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';

function cacheKey(contractId: number): string {
  return `public-contract-items:${contractId}`;
}

/**
 * A contract's items outcome, distinguishing "ESI told us this contract is
 * gone" from "items exist". A snapshot is synced twice an hour and a modal can
 * be opened long after, so by the time someone clicks a row the contract has
 * routinely already been completed, expired, or withdrawn — which is a
 * perfectly ordinary result, not a fetch failure the generic "Could not load"
 * / Refresh messaging should be shown for.
 */
export type PublicContractItemsOutcome =
  { kind: 'items'; items: PublicContractItem[] } | { kind: 'not-found' };

/** One public contract's item lines, or null if unresolvable (offline + uncached). */
export function loadPublicContractItems(
  contractId: number
): Promise<CachedResult<PublicContractItemsOutcome> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(contractId),
    async () => {
      try {
        const { data } = await getPublicContractItems(contractId);
        return data === null ? null : { kind: 'items' as const, items: data };
      } catch (err) {
        // ESI 404s a contract_id it no longer recognizes as public (expired,
        // fulfilled, withdrawn) rather than answering with an empty list —
        // caching that outcome keeps a reopened modal from re-hitting ESI to
        // learn the same thing every time.
        if (err instanceof EsiError && err.status === 404) return { kind: 'not-found' as const };
        throw err;
      }
    },
    // A contract's item lines (and whether ESI still recognizes the
    // contract at all) are fixed once it is gone. What moves is whether the
    // contract still stands, and that is the snapshot's job, not this one's.
    { staleAfterMs: STALE_AFTER.static }
  );
}
