/**
 * Fetch + cache layer for the corporation's industry jobs (issue #298).
 *
 * The corp twin of `features/industry/jobs.ts`, and deliberately not a copy of
 * its auth handling: `corpRead.ts`'s wrapper is why a 403 here is the in-game
 * role gate rather than a re-login prompt, and why the cache key is corp-scoped
 * (issue #293) — a corp change computes a different key and misses rather than
 * serving the previous corporation's jobs.
 */
import { getCorporationIndustryJobs, type CorporationIndustryJob } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'industryJobs';

export type CorpJobsLoadResult = StatusResult<CorporationIndustryJob[]>;

/** Active (non-completed) industry jobs owned by the corporation. ESI or cache. */
export function loadCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<CorpJobsLoadResult> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEY, () =>
    getCorporationIndustryJobs(characterId, corporationId, { includeCompleted: false })
  );
}
