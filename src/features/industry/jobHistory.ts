import type { IndustryJob } from '@/esi/endpoints';

export function isDeliveredJob(job: Pick<IndustryJob, 'status'>): boolean {
  return job.status === 'delivered';
}

export function isOpenJob(job: Pick<IndustryJob, 'status'>): boolean {
  return job.status === 'active' || job.status === 'paused' || job.status === 'ready';
}

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

export interface LoggedRunRef {
  id: string;
  characterId: number;
  buildPlanId: string;
  productTypeID: number;
  loggedAt: number;
  sourceJobId?: number;
}

export type HistoryJobState =
  { kind: 'unlogged' } | { kind: 'logged'; buildPlanId: string; runId: string };

export type HistoryJob = Pick<IndustryJob, 'job_id' | 'end_date' | 'product_type_id'> & {
  characterId: number;
};

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

const LOGGABLE_ACTIVITIES = new Set([1, 11]);

const INVENTION_ACTIVITY = 8;

export function inventionOutcome(
  job: Pick<IndustryJob, 'activity_id' | 'runs' | 'successful_runs'>
): { succeeded: number; runs: number } | null {
  if (job.activity_id !== INVENTION_ACTIVITY || typeof job.successful_runs !== 'number')
    return null;
  return { succeeded: job.successful_runs, runs: job.runs };
}

export function isLoggableHistoryJob(
  job: Pick<IndustryJob, 'activity_id' | 'product_type_id'>
): boolean {
  return LOGGABLE_ACTIVITIES.has(job.activity_id) && job.product_type_id !== undefined;
}

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
