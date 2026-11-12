/**
 * Corporation-owned industry jobs for Industry's Active Jobs panel (issue
 * #2302): the jobs the account's own Characters installed for their corp.
 *
 * ESI's character jobs endpoint only returns jobs the Character owns, so a
 * pilot who runs everything on corp blueprints saw an empty Industry page.
 * Those jobs only come back from the corporation endpoint, which needs both
 * the opt-in `esi-industry.read_corporation_jobs.v1` grant and an in-game
 * role (`canReadIndustry`) — held by whichever of the account's Characters
 * happens to be the corp's Factory Manager, not necessarily the one who
 * installed the job. So every corporation is read once, through any account
 * Character that can, and the panel then picks jobs by `installer_id`.
 */
import type { CorporationIndustryJob } from '@/esi/endpoints';
import { accountCorpReaders } from '@/features/corp/corpReadAccess';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export interface VisibleCorpJobsOptions {
  /** Every Character on this device — a corpmate's job is never "mine". */
  accountCharacterIds: ReadonlySet<number>;
  /** The panel's resolved character filter, applied to `installer_id`. */
  filter: MultiSelectFilter<number>;
  /**
   * The job an alert pointed at. Kept whoever installed it: the corp alert
   * fires for every corp job the reader can see, and arriving on a list that
   * filtered out the very job it named would be a dead end.
   */
  highlightJobId: number | null;
  /** Jobs the personal list already shows — never listed twice. */
  personalJobIds: ReadonlySet<number>;
}

/** The corp jobs the panel lists: installed by a selected account Character, or the one an alert named. */
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
  /** Oldest read among the corporations, null when none was read. */
  fetchedAt: Date | null;
  fromCache: boolean;
}

export const EMPTY_CORP_JOBS: CorpJobsSnapshot = {
  jobs: [],
  fetchedAt: null,
  fromCache: false,
};

/**
 * The account's readable corporations' active jobs. Never rejects: a failure
 * anywhere here must not blank the personal list it is merged into, so each
 * step degrades to "nothing from this corporation".
 *
 * The scope is checked up front from the stored token — a live 403 would
 * raise the app-wide re-auth banner for a grant the pilot never opted into —
 * and the roles from the cached roles read (`accountCorpReaders`).
 */
export async function loadAccountCorpIndustryJobs(
  preferredCharacterId?: number
): Promise<CorpJobsSnapshot> {
  try {
    // Roles and grant settled per Character before any corp call (`corpReadAccess.ts`).
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
        } catch {
          // This corporation contributes nothing; the others still list.
        }
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
