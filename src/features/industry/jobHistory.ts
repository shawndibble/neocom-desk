/**
 * Pure rules for the Active Jobs "History" view (issue #2866): which ESI jobs
 * are history, how fetched jobs fold into the stored history, and which
 * delivered jobs the Production Log already covers. No fetch/DOM/Dexie here.
 */
import type { IndustryJob } from '@/esi/endpoints';

/** A job that is history: collected, output in the hangar. */
export function isDeliveredJob(job: Pick<IndustryJob, 'status'>): boolean {
  return job.status === 'delivered';
}

/**
 * A job that still belongs on the Active list: running, paused, or finished
 * but not yet collected (`ready`). Delivered, cancelled and reverted jobs are
 * what `include_completed=true` adds; every cache reader (slots, alerts,
 * board) expects them absent, so the loader strips them.
 */
export function isOpenJob(job: Pick<IndustryJob, 'status'>): boolean {
  return job.status === 'active' || job.status === 'paused' || job.status === 'ready';
}

/**
 * Folds a fetch into the stored history. Delivered jobs are kept even once ESI
 * stops returning them; a fetched copy replaces the stored one by `job_id`. A
 * stored job a later fetch reports as anything but delivered (reverted) is
 * dropped. Newest `end_date` first.
 */
export function mergeJobHistory(
  stored: readonly IndustryJob[],
  fetched: readonly IndustryJob[]
): IndustryJob[] {
  const byId = new Map<number, IndustryJob>(stored.map((job) => [job.job_id, job]));
  for (const job of fetched) {
    if (isDeliveredJob(job)) byId.set(job.job_id, job);
    else if (!isOpenJob(job)) byId.delete(job.job_id);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.end_date) - Date.parse(a.end_date));
}

/** The slice of a Production Run the matching reads. */
export interface LoggedRunRef {
  id: string;
  characterId: number;
  buildPlanId: string;
  productTypeID: number;
  loggedAt: number;
  /** Set when the run was logged from this job's "Log production" action. */
  sourceJobId?: number;
}

export type HistoryJobState =
  { kind: 'unlogged' } | { kind: 'logged'; buildPlanId: string; runId: string };

export type HistoryJob = Pick<IndustryJob, 'job_id' | 'end_date' | 'product_type_id'> & {
  characterId: number;
};

/**
 * Logged vs unlogged per job id. A run that names its job (`sourceJobId`) is
 * an exact match and claims it first. For runs logged by hand there is no link,
 * so the rest fall back to same Character + product type + logged after the
 * job ended, oldest job taking the earliest eligible run. Units are not
 * compared: a job records runs, not units, and the log form lets the pilot
 * edit the quantity anyway. Each run covers at most one job.
 */
export function classifyHistoryJobs(
  jobs: readonly HistoryJob[],
  runs: readonly LoggedRunRef[]
): Map<number, HistoryJobState> {
  const states = new Map<number, HistoryJobState>();
  const used = new Set<string>();

  const exact = new Map<number, LoggedRunRef>();
  for (const r of runs) {
    if (r.sourceJobId !== undefined && !exact.has(r.sourceJobId)) exact.set(r.sourceJobId, r);
  }
  for (const j of jobs) {
    const r = exact.get(j.job_id);
    if (r) {
      used.add(r.id);
      states.set(j.job_id, { kind: 'logged', buildPlanId: r.buildPlanId, runId: r.id });
    }
  }

  const loose = runs
    .filter((r) => r.sourceJobId === undefined)
    .sort((a, b) => a.loggedAt - b.loggedAt);
  const oldestFirst = [...jobs].sort((a, b) => Date.parse(a.end_date) - Date.parse(b.end_date));
  for (const j of oldestFirst) {
    if (states.has(j.job_id)) continue;
    const endMs = Date.parse(j.end_date);
    const match =
      j.product_type_id === undefined
        ? undefined
        : loose.find(
            (r) =>
              !used.has(r.id) &&
              r.characterId === j.characterId &&
              r.productTypeID === j.product_type_id &&
              r.loggedAt >= endMs
          );
    if (match) {
      used.add(match.id);
      states.set(j.job_id, { kind: 'logged', buildPlanId: match.buildPlanId, runId: match.id });
    } else {
      states.set(j.job_id, { kind: 'unlogged' });
    }
  }
  return states;
}

/** Activity ids the Production Log can record: manufacturing and reactions. */
const LOGGABLE_ACTIVITIES = new Set([1, 11]);

/** Whether a delivered job is something the Production Log could hold at all. */
export function isLoggableHistoryJob(
  job: Pick<IndustryJob, 'activity_id' | 'product_type_id'>
): boolean {
  return LOGGABLE_ACTIVITIES.has(job.activity_id) && job.product_type_id !== undefined;
}

/**
 * Delivered, loggable jobs with no run — the "N delivered, not logged" figure.
 * `blueprintTypeId` narrows it to one Build Plan's blueprint. A dismissed job
 * (`dismissedJobIds`) is left out; one that was logged counts as logged either way.
 */
export function countUnloggedDeliveries(
  jobs: readonly (Pick<IndustryJob, 'job_id' | 'activity_id' | 'product_type_id'> & {
    blueprint_type_id: number;
  })[],
  states: ReadonlyMap<number, HistoryJobState>,
  options: { blueprintTypeId?: number; dismissedJobIds?: ReadonlySet<number> } = {}
): number {
  return jobs.filter(
    (job) =>
      isLoggableHistoryJob(job) &&
      states.get(job.job_id)?.kind !== 'logged' &&
      !options.dismissedJobIds?.has(job.job_id) &&
      (options.blueprintTypeId === undefined || job.blueprint_type_id === options.blueprintTypeId)
  ).length;
}
