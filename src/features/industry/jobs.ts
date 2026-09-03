/**
 * Fetch + cache layer for a character's active industry jobs, plus pure view
 * helpers (sort, progress, "done"/"completing soon", activity naming).
 *
 * `esi-industry.read_character_jobs.v1` is a scope added after some
 * characters already logged in, so a 403 here can mean "this login predates
 * the scope" rather than "offline." loadCharacterIndustryJobs surfaces that
 * as `needsReauth: true` and skips the cache fallback (via
 * `skipCacheOnAuthFailure`) instead of silently falling back — there is
 * nothing useful to fall back to anyway, since a character that has never
 * granted the scope has never successfully cached a jobs response. Only a
 * 403 counts here (narrower than the shared default's 401-or-403): this
 * endpoint's scope check is what returns 403.
 */
import { getCharacterIndustryJobs, type IndustryJob } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'industryJobs';

export type JobsLoadResult = StatusResult<IndustryJob[]>;

/** Active (non-completed) industry jobs for a character. ESI or cache, with a distinct reauth state. */
export function loadCharacterIndustryJobs(characterId: number): Promise<JobsLoadResult> {
  return loadWithCacheStatus(
    characterId,
    KEY,
    async () => (await getCharacterIndustryJobs(characterId, { includeCompleted: false })).data,
    {
      detectAuthFailure: (err) => err instanceof EsiError && err.status === 403,
      skipCacheOnAuthFailure: true,
    }
  );
}

// --- Pure view helpers (no fetch/DOM/Dexie — safe to unit-test with plain numbers) ---

/**
 * The fields the Active jobs list actually reads.
 *
 * Structural, not nominal, so the corporation job shape satisfies it as-is
 * (issue #298): the two differ only in `location_id` vs `station_id` and a
 * handful of corp-only ids, none of which this list renders. Typing the helpers
 * and the CSV columns on the subset is what lets one table serve both owners
 * rather than a second panel serving the second one.
 */
export type ActiveJob = Pick<
  IndustryJob,
  | 'job_id'
  | 'activity_id'
  | 'blueprint_type_id'
  | 'runs'
  | 'start_date'
  | 'end_date'
  | 'status'
  | 'cost'
>;

/** Ending soonest first. */
export function sortJobsBySoonest<T extends Pick<IndustryJob, 'end_date'>>(
  jobs: readonly T[]
): T[] {
  return [...jobs].sort((a, b) => Date.parse(a.end_date) - Date.parse(b.end_date));
}

/** Fraction of the job's start->end window elapsed as of `nowMs`, clamped 0..1. */
export function jobProgress(
  job: Pick<IndustryJob, 'start_date' | 'end_date'>,
  nowMs: number
): number {
  const start = Date.parse(job.start_date);
  const end = Date.parse(job.end_date);
  if (!(end > start)) return nowMs >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
}

/** Whether the job's window has already ended as of `nowMs` ("Done"). */
export function isJobDone(job: Pick<IndustryJob, 'end_date'>, nowMs: number): boolean {
  return nowMs >= Date.parse(job.end_date);
}

/** Whether the job ends within the next hour (not already done) — "completing soon" highlight. */
export function isCompletingSoon(job: Pick<IndustryJob, 'end_date'>, nowMs: number): boolean {
  const remainingMs = Date.parse(job.end_date) - nowMs;
  return remainingMs > 0 && remainingMs <= 3_600_000;
}

/** Seconds remaining until end_date, clamped >= 0 (feed to formatDuration for display). */
export function secondsRemaining(job: Pick<IndustryJob, 'end_date'>, nowMs: number): number {
  return Math.max(0, (Date.parse(job.end_date) - nowMs) / 1000);
}

/** EVE industry activity IDs this app surfaces, per the task's scope decision (manufacturing v1 + these read views). */
const ACTIVITY_NAMES: Record<number, string> = {
  1: 'manufacturing',
  3: 'timeEfficiencyResearch',
  4: 'materialEfficiencyResearch',
  5: 'copying',
  8: 'invention',
  11: 'reaction',
};

/** i18n key for a job's activity name; unknown IDs fall back to a generic labeled key. */
export function activityI18nKey(activityId: number): string {
  const name = ACTIVITY_NAMES[activityId];
  return name ? `industry.activity.${name}` : 'industry.activity.unknown';
}
