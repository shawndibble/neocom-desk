/**
 * Fetch + cache layer for the corporation's industry jobs (issue #298).
 *
 * The corp twin of `features/industry/jobs.ts`, and deliberately not a copy of
 * its auth handling: see `corpAuthFailure.ts` for why a 403 here is the in-game
 * role gate rather than a re-login prompt.
 *
 * The cache key is `corpCacheKey`'d (issue #293), so a corp change computes a
 * different key and misses rather than serving the previous corporation's jobs.
 */
import { getCorporationIndustryJobs, type CorporationIndustryJob } from '@/esi/endpoints';
import { corpCacheKey, loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';
import { detectCorpAuthFailure } from './corpAuthFailure';

const KEY = 'industryJobs';

export type CorpJobsLoadResult = StatusResult<CorporationIndustryJob[]>;

/** Active (non-completed) industry jobs owned by the corporation. ESI or cache. */
export function loadCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<CorpJobsLoadResult> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, KEY),
    () => getCorporationIndustryJobs(characterId, corporationId, { includeCompleted: false }),
    { detectAuthFailure: detectCorpAuthFailure }
  );
}
