/**
 * Fetch + cache layer for the corporation's assets (issue #327).
 *
 * The corp twin of `features/character/assets.ts`, and the same three
 * departures every corp data module makes: `corpCacheKey` (issue #293) so a
 * corporation change misses rather than serving the previous corporation's
 * hangars, `detectCorpAuthFailure` so a 403 reads as the in-game role gate
 * rather than an expired session, and a corporation id alongside the Character
 * whose token pays for the call.
 *
 * The role gate is the whole story on this endpoint: `x-required-roles` is
 * `["Director"]` and nothing else, so a 403 is the ordinary answer for almost
 * everyone — see `engine/corpRoles.ts`'s `canReadAssets`.
 *
 * Registered and cached, with no surface reading it yet. `/assets` deliberately
 * does not offer a Personal / Corporation switch: seven hangar divisions across
 * many structures do not fit the station-and-container tree that page browses
 * (CONTEXT.md round 41). The corp assets surface is its own ticket, and this is
 * the read it will use.
 */
import { getCorporationAssets, type CorporationAsset } from '@/esi/endpoints';
import { corpCacheKey, loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';
import { detectCorpAuthFailure } from './corpAuthFailure';

/**
 * Exported so a test can assert the row it lands in. Distinct from the
 * character list's `assets` key even before `corpCacheKey` wraps it: the two
 * lists share a Character's cache table and must never be mistaken for each
 * other.
 */
export const CORP_ASSETS_KEY = 'assets:corporation';

export type CorpAssetsLoadResult = StatusResult<CorporationAsset[]>;

/**
 * Everything the corporation owns. ESI or cache. `truncated` on the result
 * means the page cap was hit or a page was missing, so the list is short —
 * corp holdings are the larger of the two asset lists, so that is likelier here
 * than on a Character's own.
 */
export function loadCorporationAssets(
  characterId: number,
  corporationId: number
): Promise<CorpAssetsLoadResult> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, CORP_ASSETS_KEY),
    () => getCorporationAssets(characterId, corporationId),
    { detectAuthFailure: detectCorpAuthFailure }
  );
}
