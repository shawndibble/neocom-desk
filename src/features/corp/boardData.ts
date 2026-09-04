/**
 * The two reads the corp ops board adds, plus the corporation id every corp key
 * is built from (issue #296).
 *
 * Deliberately small. The wallet, divisions, journal and industry-jobs reads
 * this board also needs already exist as `wallet.ts` and `jobs.ts` (#298) and
 * are used as they are — the board is a second consumer of those, not a second
 * copy. What is left here is the structure list, the moon-extraction schedule,
 * and `loadCorporationId`.
 *
 * Two rules hold across every corp read, here and there — both applied by
 * `corpRead.ts`'s wrapper rather than by hand at each loader:
 *
 * - **Every row is filed under `corpCacheKey`** (#293). `esiCache` is keyed
 *   `[characterId, key]`, which can say "this Character's skills" but not "this
 *   corporation's structures, as read by this Character". Folding the
 *   corporation id into the key makes a cross-corp read miss by construction
 *   rather than by convention.
 * - **A 403 is the in-game role gate, never a re-login** (`corpAuthFailure.ts`).
 *
 * Nothing here is fetched without its capability either, but that check lives
 * at the caller (`routes/Corp.tsx`): it is what decides which panels exist, and
 * a loader that silently returned nothing would hide the decision.
 *
 * The freshness window is the app-wide default on purpose. CCP caches these
 * endpoints for about an hour and `esi/cache.ts` takes whichever of the two is
 * *later*, so the hour arrives on its own — a corp-specific constant would
 * change nothing except give a future reader something to keep in step.
 */
import {
  getCharacterPublicInfo,
  getCorporationMiningExtractions,
  getCorporationStructures,
  type CorporationMiningExtraction,
  type CorporationStructure,
} from '@/esi/endpoints';
import { loadWithCacheStatus } from '@/esi/cache';
import type { StatusResult } from '@/esi/cache';
import { recordCharacterCorporation } from '@/auth/session';
import { db } from '@/db';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

/**
 * Which corporation this Character is in, as a read rather than a lookup.
 *
 * `owner.ts`'s `useActiveCorporationId` answers the same question from Dexie
 * and is the right shape for a *gate* — a control must not render while the
 * answer is unknown. This is the other shape: the board's loader has to be able
 * to *learn* it. `db.characters.corporationId` is written only as a side effect
 * of the public-info read, so a Character who deep-links to `/corp` on a fresh
 * device has nothing there, and every read below would key on `undefined` —
 * a real cache row that then survives a corporation change, which is exactly
 * what #293 exists to prevent.
 *
 * Reading it through the cache gives a value on the first visit, a value while
 * offline, and — because the live path goes through `recordCharacterCorporation`
 * — the corp-change purge firing here too rather than only wherever public info
 * happened to be read. It also settles the Dexie field, so the nav entry gated
 * on `useActiveCorporationId` appears from the next render on.
 *
 * Not a corp-scoped key, obviously: this is the read that *discovers* the
 * corporation, so it cannot be filed under it.
 */
export async function loadCorporationId(characterId: number): Promise<number | null> {
  const { cached } = await loadWithCacheStatus<number>(characterId, 'corpIdentity', async () => {
    const info = (await getCharacterPublicInfo(characterId)).data;
    if (info === null) return null;
    try {
      await recordCharacterCorporation(characterId, info.corporation_id);
    } catch {
      // Dexie unavailable. The id itself is still good, and the purge trigger
      // fires again on the next public-info read.
    }
    return info.corporation_id;
  });
  if (cached !== null) return cached.data;
  // Last resort for a cold, offline start: whatever a previous session learned.
  // `undefined` means "not learned", never corporation 0.
  return (await db.characters.get(characterId))?.corporationId ?? null;
}

export function loadCorporationStructures(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationStructure[]>> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, 'structures', () =>
    getCorporationStructures(characterId, corporationId)
  );
}

export function loadCorporationMiningExtractions(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMiningExtraction[]>> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, 'miningExtractions', () =>
    getCorporationMiningExtractions(characterId, corporationId)
  );
}

/**
 * The division the vitals rail reads a journal from.
 *
 * ESI publishes no all-divisions journal and the seven are separately
 * role-gated, so the rail's net and runway can only ever describe one wallet.
 * The master is the one every Accountant can see, and the one office rent and
 * fuel purchases actually clear through.
 */
export const MASTER_WALLET_DIVISION = 1;
