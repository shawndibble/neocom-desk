/**
 * Fetch + cache layer for the corp ops board, one function per endpoint.
 *
 * Two rules hold across every read here, and neither is optional:
 *
 * - **Every row is filed under `corpCacheKey`** (#293). `esiCache` is keyed
 *   `[characterId, key]`, which can say "this Character's skills" but not "this
 *   corporation's structures, as read by this Character". Folding the
 *   corporation id into the key makes a cross-corp read miss by construction
 *   rather than by convention — there is no window in which the previous
 *   corporation's rows can be served under the new one, even if the purge
 *   fails.
 * - **Nothing is fetched without its capability.** CCP role-gates these
 *   server-side, so calling one a Character cannot read buys a guaranteed 403
 *   and an activity-log entry for it. The capability check lives at the caller
 *   (`Corp.tsx`), which is also what lets a Station Manager who is not an
 *   Accountant see structures and simply no wallet rail.
 *
 * The freshness window is deliberately the app-wide default. CCP caches these
 * endpoints for about an hour and `esi/cache.ts` takes whichever of the two is
 * *later*, so the hour arrives on its own — a corp-specific constant would
 * change nothing except give a future reader something to keep in step.
 */
import {
  getCharacterPublicInfo,
  getCorporationDivisions,
  getCorporationIndustryJobs,
  getCorporationMiningExtractions,
  getCorporationStructures,
  getCorporationWalletJournal,
  getCorporationWallets,
  type CorporationDivisions,
  type CorporationIndustryJob,
  type CorporationMiningExtraction,
  type CorporationStructure,
  type CorporationWalletDivision,
  type WalletJournalEntry,
} from '@/esi/endpoints';
import {
  corpCacheKey,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';
import { recordCharacterCorporation } from '@/auth/session';
import { db } from '@/db';

/**
 * A 403 here means "this Character's in-game roles do not open this endpoint",
 * which no amount of logging in again can fix — so it must never be reported as
 * `needsReauth` the way a missing scope is. The board's answer to an unreadable
 * panel is to render nothing at all (CONTEXT.md round 35), and `useCorpAccess`
 * should have kept the call from being made in the first place; this narrows
 * the default so a 403 that slips through (a role revoked between the roles
 * read and the panel's) degrades quietly rather than into a re-login banner
 * nobody can act on.
 *
 * This also suppresses the app-wide signal, which is the half that matters
 * most: `esi/cache.ts` calls `emitEsiAuthFailure` *inside* its
 * `detectAuthFailure(err)` branch, so overriding the predicate keeps a corp 403
 * from raising `AuthFailureNotice` across the whole shell — which would herd a
 * Station Manager whose role was just revoked toward a re-login that cannot
 * help.
 */
const CORP_LOAD_OPTIONS = { detectAuthFailure: () => false } as const;

/** The master wallet division — see `loadCorporationWalletJournal`. */
export const MASTER_WALLET_DIVISION = 1;

/**
 * Which corporation this Character is in, as a live-ish read rather than a
 * lookup.
 *
 * The board cannot use `db.characters.corporationId` on its own: that field is
 * optional and written only as a side effect of `stores/publicInfo`, so a
 * Character who deep-links to `/corp` on a fresh device has no value there and
 * every read below would key on `undefined` — a real cache row that would then
 * leak across a corporation change, which is exactly what #293 exists to
 * prevent.
 *
 * Reading it through the cache instead gives three things at once: a value on
 * the first visit, a value while offline, and — because the live path goes
 * through `recordCharacterCorporation` — the corp-change purge firing here too
 * rather than only wherever public info happened to be read.
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
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, 'structures'),
    () => getCorporationStructures(characterId, corporationId),
    CORP_LOAD_OPTIONS
  );
}

export function loadCorporationMiningExtractions(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMiningExtraction[]>> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, 'miningExtractions'),
    () => getCorporationMiningExtractions(characterId, corporationId),
    CORP_LOAD_OPTIONS
  );
}

/**
 * `include_completed` stays false: "completed" means delivered or cancelled,
 * and `ready` — a finished job whose output is still sitting in the facility —
 * is neither. Those are the only ones the board raises.
 */
export function loadCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationIndustryJob[]>> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, 'industryJobs'),
    () => getCorporationIndustryJobs(characterId, corporationId, { includeCompleted: false }),
    CORP_LOAD_OPTIONS
  );
}

export function loadCorporationWallets(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationWalletDivision[]>> {
  return loadWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, 'wallets'),
    async () => (await getCorporationWallets(characterId, corporationId)).data,
    CORP_LOAD_OPTIONS
  );
}

export function loadCorporationDivisions(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationDivisions>> {
  return loadWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, 'divisions'),
    async () => (await getCorporationDivisions(characterId, corporationId)).data,
    CORP_LOAD_OPTIONS
  );
}

/**
 * One division's journal. ESI publishes no all-divisions journal and the seven
 * are separately role-gated, so the rail's 30-day net reads the master wallet
 * (division 1) only — the one every Accountant can see, and the one office
 * rent and fuel purchases actually clear through.
 */
export function loadCorporationWalletJournal(
  characterId: number,
  corporationId: number,
  division: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, `walletJournal:${division}`),
    () => getCorporationWalletJournal(characterId, corporationId, division),
    CORP_LOAD_OPTIONS
  );
}
