import type { CorporationIndustryJob } from '@/esi/endpoints';
import { accountCorpReaders } from '@/features/corp/corpReadAccess';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export interface VisibleCorpJobsOptions {
  accountCharacterIds: ReadonlySet<number>;
  filter: MultiSelectFilter<number>;
  highlightJobId: number | null;
  personalJobIds: ReadonlySet<number>;
}

export function visibleCorpJobs<T extends Pick<CorporationIndustryJob, 'job_id' | 'installer_id'>>(
  jobs: readonly T[],
  { accountCharacterIds, filter, highlightJobId, personalJobIds }: VisibleCorpJobsOptions
): T[] {
  const seen = new Set<number>();
  return jobs.filter((job) => {
    if (personalJobIds.has(job.job_id) || seen.has(job.job_id)) return false;
    const installedBySelected =
      accountCharacterIds.has(job.installer_id) &&
      (filter === 'all' || filter.has(job.installer_id));
    if (!installedBySelected && job.job_id !== highlightJobId) return false;
    seen.add(job.job_id);
    return true;
  });
}

export interface CorpJobsSnapshot {
  jobs: CorporationIndustryJob[];
  fetchedAt: Date | null;
  fromCache: boolean;
}

export const EMPTY_CORP_JOBS: CorpJobsSnapshot = {
  jobs: [],
  fetchedAt: null,
  fromCache: false,
};

export async function loadAccountCorpIndustryJobs(
  preferredCharacterId?: number
): Promise<CorpJobsSnapshot> {
  try {
    const readers = await accountCorpReaders('canReadIndustry', preferredCharacterId);
    const jobs: CorporationIndustryJob[] = [];
    const fetchedAts: number[] = [];
    let fromCache = false;
    await mapWithConcurrencyLimit(
      [...readers.entries()],
      ESI_FANOUT_CONCURRENCY,
      async ([corporationId, readerId]) => {
        try {
          const result = await loadCorporationIndustryJobs(readerId, corporationId);
          if (result.cached === null) return;
          jobs.push(...result.cached.data);
          fetchedAts.push(result.cached.fetchedAt.getTime());
          fromCache ||= result.cached.fromCache;
        } catch {}
      }
    );
    return {
      jobs,
      fetchedAt: fetchedAts.length > 0 ? new Date(Math.min(...fetchedAts)) : null,
      fromCache,
    };
  } catch {
    return EMPTY_CORP_JOBS;
  }
}
