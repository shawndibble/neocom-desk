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
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

const KEY = 'industryJobs';
const JOBS_SCOPE = ESI_REGISTRY.getCharacterIndustryJobs.scope;

/** The cache key this module owns, exported so a cache-only cross-character reader (`rosterAttention.ts`) reads exactly the row this loader writes. */
export const KEYS = { jobs: KEY } as const;

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

export interface JobsFanOutEntry {
  characterId: number;
  characterName: string;
  result: JobsLoadResult;
}

export interface JobsFanOutSnapshot {
  entries: JobsFanOutEntry[];
  /** Never granted the industry-jobs scope — listed, never fetched (same policy as `openOrdersData.ts`). */
  skipped: { characterId: number; name: string }[];
}

/**
 * Every authenticated Character's active industry jobs, for Industry's
 * cross-character Active Jobs view (issue #607). Mirrors
 * `openOrdersData.ts`'s `loadAllCharactersOpenOrders`: the scope is checked
 * UP FRONT per Character rather than left to a live 403 (a live 403 would
 * raise the app-wide re-auth banner naming an alt the player never asked
 * about), and a Character WITH the scope whose live call still comes back
 * `needsReauth` stays in `entries` (not `skipped`) so its row can show its
 * own re-auth prompt.
 */
export async function loadAllCharactersIndustryJobs(): Promise<JobsFanOutSnapshot> {
  const characters = await db.characters.toArray();
  const granted = await Promise.all(
    characters.map(async (character) => {
      const token = await db.tokens.get(character.characterId);
      return (token?.scopes ?? []).includes(JOBS_SCOPE);
    })
  );

  const toFetch = characters.filter((_, i) => granted[i]);
  const noScopeSkipped = characters
    .filter((_, i) => !granted[i])
    .map(({ characterId, name }) => ({ characterId, name }));

  // Slotted by original index, not push-on-completion order — same reasoning
  // as `openOrdersData.ts`: ordering stays stable regardless of which
  // Character's fetch lands first.
  const slots: (JobsFanOutEntry | null)[] = new Array(toFetch.length).fill(null);
  const fetchFailedSkipped: { characterId: number; name: string }[] = [];
  await mapWithConcurrencyLimit(
    toFetch.map((character, index) => ({ character, index })),
    ESI_FANOUT_CONCURRENCY,
    async ({ character, index }) => {
      const { characterId, name } = character;
      try {
        const result = await loadCharacterIndustryJobs(characterId);
        slots[index] = { characterId, characterName: name, result };
      } catch {
        fetchFailedSkipped.push({ characterId, name });
      }
    }
  );

  const entries = slots.filter((entry): entry is JobsFanOutEntry => entry !== null);
  return { entries, skipped: [...noScopeSkipped, ...fetchFailedSkipped] };
}

export type IndustryJobWithCharacter = IndustryJob & {
  characterId: number;
  characterName: string;
};

/**
 * Filters a fan-out's `entries` by the character picker's current value,
 * then flattens each survivor's `result.cached?.data ?? []` into one list,
 * each job tagged with its owner. The result still satisfies
 * `sortJobsBySoonest`/`summarizeJobs`'s existing
 * `T extends Pick<IndustryJob, 'end_date'>` bound unchanged.
 */
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
  | 'product_type_id'
  | 'runs'
  | 'start_date'
  | 'end_date'
  | 'status'
  | 'cost'
>;

/**
 * The typeID the job's context menu (Market/Quickbar/PI/Build Plan) acts on:
 * the manufactured product when there is one, else the blueprint itself
 * (research/copying/invention jobs have no product).
 */
export function contextMenuTypeId(
  job: Pick<ActiveJob, 'blueprint_type_id' | 'product_type_id'>
): number {
  return job.product_type_id ?? job.blueprint_type_id;
}

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

/** The one-line read of a job list: how many still run, how many finished, and which finishes next. */
export interface JobsSummary<T> {
  running: number;
  done: number;
  /** The unfinished job ending soonest, or null when nothing is still running. */
  next: { job: T; seconds: number } | null;
}

/**
 * Collapses a job list to what the panel's closed strip says. Sorts itself
 * rather than trusting the caller's order, so `next` is right whatever
 * order the rows arrive in.
 */
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
