import { getCharacterIndustryJobs, type IndustryJob } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import { isOpenJob } from './jobHistory';
import { recordJobHistory } from './jobHistoryStore';
import { HOUR_MS } from '@/lib/age';

const KEY = 'industryJobs';
const JOBS_SCOPE = ESI_REGISTRY.getCharacterIndustryJobs.scope;

export const KEYS = { jobs: KEY } as const;

export type JobsLoadResult = StatusResult<IndustryJob[]>;

export function loadCharacterIndustryJobs(characterId: number): Promise<JobsLoadResult> {
  const { fetchLive, conditional } = conditionalFetch(async (options) => {
    const result = await getCharacterIndustryJobs(characterId, {
      ...options,
      includeCompleted: true,
    });
    if (!result.data) return result;
    await recordJobHistory(characterId, result.data);
    return { ...result, data: result.data.filter(isOpenJob) };
  });
  return loadWithCacheStatus(characterId, KEY, fetchLive, {
    detectAuthFailure: (err) => err instanceof EsiError && err.status === 403,
    skipCacheOnAuthFailure: true,
    conditional,
  });
}

export interface JobsFanOutEntry {
  characterId: number;
  characterName: string;
  result: JobsLoadResult;
}

export interface JobsFanOutSnapshot {
  entries: JobsFanOutEntry[];
  skipped: { characterId: number; name: string }[];
}

export function loadAllCharactersIndustryJobs(): Promise<JobsFanOutSnapshot> {
  return fanOutAllCharacters<JobsFanOutEntry>({
    scope: JOBS_SCOPE,
    load: async ({ characterId, name }) => ({
      characterId,
      characterName: name,
      result: await loadCharacterIndustryJobs(characterId),
    }),
  });
}

export type IndustryJobWithCharacter = IndustryJob & {
  characterId: number;
  characterName: string;
};

export function flattenJobsWithCharacter(
  entries: readonly JobsFanOutEntry[],
  filter: MultiSelectFilter<number>
): IndustryJobWithCharacter[] {
  const selected = entries.filter((entry) => filter === 'all' || filter.has(entry.characterId));
  return selected.flatMap((entry) =>
    (entry.result.cached?.data ?? []).map((job) => ({
      ...job,
      characterId: entry.characterId,
      characterName: entry.characterName,
    }))
  );
}

export type ActiveJob = Pick<
  IndustryJob,
  | 'job_id'
  | 'activity_id'
  | 'blueprint_type_id'
  | 'product_type_id'
  | 'runs'
  | 'start_date'
  | 'end_date'
  | 'status'
  | 'cost'
  | 'successful_runs'
>;

export function sortJobsBySoonest<T extends Pick<IndustryJob, 'end_date'>>(
  jobs: readonly T[]
): T[] {
  return [...jobs].sort((a, b) => Date.parse(a.end_date) - Date.parse(b.end_date));
}

export function jobProgress(
  job: Pick<IndustryJob, 'start_date' | 'end_date'>,
  nowMs: number
): number {
  const start = Date.parse(job.start_date);
  const end = Date.parse(job.end_date);
  if (!(end > start)) return nowMs >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
}

export function isJobDone(job: Pick<IndustryJob, 'end_date'>, nowMs: number): boolean {
  return nowMs >= Date.parse(job.end_date);
}

export function isCompletingSoon(job: Pick<IndustryJob, 'end_date'>, nowMs: number): boolean {
  const remainingMs = Date.parse(job.end_date) - nowMs;
  return remainingMs > 0 && remainingMs <= HOUR_MS;
}

export function secondsRemaining(job: Pick<IndustryJob, 'end_date'>, nowMs: number): number {
  return Math.max(0, (Date.parse(job.end_date) - nowMs) / 1000);
}

const LOGGABLE_PRODUCTION_ACTIVITIES = new Set([1, 11]);

export function canLogProductionFromJob(
  job: Pick<IndustryJob, 'activity_id' | 'product_type_id' | 'end_date'>,
  nowMs: number
): boolean {
  return (
    isJobDone(job, nowMs) &&
    LOGGABLE_PRODUCTION_ACTIVITIES.has(job.activity_id) &&
    job.product_type_id !== undefined
  );
}

const ACTIVITY_NAMES: Record<number, string> = {
  1: 'manufacturing',
  3: 'timeEfficiencyResearch',
  4: 'materialEfficiencyResearch',
  5: 'copying',
  8: 'invention',
  11: 'reaction',
};

export function activityI18nKey(activityId: number): string {
  const name = ACTIVITY_NAMES[activityId];
  return name ? `industry.activity.${name}` : 'industry.activity.unknown';
}

export interface JobsSummary<T> {
  running: number;
  done: number;
  next: { job: T; seconds: number } | null;
}

export function summarizeJobs<T extends Pick<IndustryJob, 'end_date'>>(
  jobs: readonly T[],
  nowMs: number
): JobsSummary<T> {
  let running = 0;
  let done = 0;
  let next: JobsSummary<T>['next'] = null;
  for (const job of sortJobsBySoonest(jobs)) {
    if (isJobDone(job, nowMs)) {
      done += 1;
      continue;
    }
    running += 1;
    if (next === null) next = { job, seconds: secondsRemaining(job, nowMs) };
  }
  return { running, done, next };
}

export const JOBS_TICK_MS = 30_000;
