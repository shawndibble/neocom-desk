/**
 * Fetch + cache layer for a character's active industry jobs, plus pure view
 * helpers (sort, progress, "done"/"completing soon", activity naming).
 *
 * Read-through pattern mirrors src/features/skills/data.ts (duplicated
 * rather than imported — that module is read-only territory for this
 * feature, per src/features/industry/data.ts's existing convention).
 *
 * Diverges from that pattern in one deliberate way:
 * `esi-industry.read_character_jobs.v1` is a scope added after some
 * characters already logged in, so a 403 here can mean "this login predates
 * the scope" rather than "offline." loadCharacterIndustryJobs surfaces that
 * as `needsReauth: true` instead of silently falling back to cache — there
 * is nothing useful to fall back to anyway, since a character that has never
 * granted the scope has never successfully cached a jobs response.
 */
import { db } from '@/db';
import { getCharacterIndustryJobs, type IndustryJob } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

const KEY = 'industryJobs';

export interface JobsLoadResult {
  /** ESI or cache; null when there's no live data and nothing cached. */
  cached: CachedResult<IndustryJob[]> | null;
  /** True when the live call failed with 403: re-login is the fix, not a refresh. */
  needsReauth: boolean;
}

/** Active (non-completed) industry jobs for a character. ESI or cache, with a distinct reauth state. */
export async function loadCharacterIndustryJobs(characterId: number): Promise<JobsLoadResult> {
  try {
    const data = (await getCharacterIndustryJobs(characterId, { includeCompleted: false })).data;
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key: KEY, value: data, fetchedAt });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (err instanceof EsiError && err.status === 403) {
      return { cached: null, needsReauth: true };
    }
    // Any other failure (offline, 5xx, timeout): fall back to cache below.
  }
  const cachedRow = await db.esiCache.get([characterId, KEY]);
  if (!cachedRow) return { cached: null, needsReauth: false };
  return {
    cached: {
      data: cachedRow.value as IndustryJob[],
      fetchedAt: new Date(cachedRow.fetchedAt),
      fromCache: true,
    },
    needsReauth: false,
  };
}

// --- Pure view helpers (no fetch/DOM/Dexie — safe to unit-test with plain numbers) ---

/** Ending soonest first. */
export function sortJobsBySoonest(jobs: readonly IndustryJob[]): IndustryJob[] {
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
