import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationIndustryJobs, type CorporationIndustryJob } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'industryJobs';

export type CorpJobsLoadResult = StatusResult<CorporationIndustryJob[]>;

export function loadCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<CorpJobsLoadResult> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationIndustryJobs(characterId, corporationId, { ...options, includeCompleted: false })
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEY, fetchLive, {
    conditional,
  });
}
