import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { IndustryJob } from '@/esi/endpoints';
import {
  classifyHistoryJobs,
  countUnloggedDeliveries,
  type HistoryJob,
  type HistoryJobState,
  type LoggedRunRef,
} from './jobHistory';

export type HistoryJobWithCharacter = IndustryJob & { characterId: number };

const NONE: never[] = [];

export function projectRuns(rows: readonly LoggedRunRef[]): LoggedRunRef[] {
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    buildPlanId: r.buildPlanId,
    productTypeID: r.productTypeID,
    loggedAt: r.loggedAt,
    sourceJobId: r.sourceJobId,
  }));
}

export function useJobHistoryData(): {
  jobs: HistoryJobWithCharacter[] | undefined;
  runs: LoggedRunRef[] | undefined;
  dismissedJobIds: ReadonlySet<number>;
} {
  const history = useLiveQuery(() => db.industryJobHistory.toArray(), []);
  const runs = useLiveQuery(() => db.productionRuns.toArray().then(projectRuns), []);
  const jobs = useMemo(
    () =>
      history?.flatMap((row) => row.jobs.map((job) => ({ ...job, characterId: row.characterId }))),
    [history]
  );
  const dismissedJobIds = useMemo(
    () => new Set(history?.flatMap((row) => row.dismissedJobIds ?? [])),
    [history]
  );
  return { jobs, runs, dismissedJobIds };
}

export function useHistoryStates(
  jobs: readonly HistoryJob[],
  runs: readonly LoggedRunRef[] | undefined
): Map<number, HistoryJobState> {
  return useMemo(() => classifyHistoryJobs(jobs, runs ?? NONE), [jobs, runs]);
}

export function useUnloggedDeliveryCount(characterId: number, blueprintTypeId: number): number {
  const stored = useLiveQuery(() => db.industryJobHistory.get(characterId), [characterId]);
  const runs = useLiveQuery(
    () => db.productionRuns.where('characterId').equals(characterId).toArray().then(projectRuns),
    [characterId]
  );
  return useMemo(() => {
    const jobs = (stored?.jobs ?? []).map((job) => ({ ...job, characterId }));
    const states = classifyHistoryJobs(jobs, runs ?? NONE);
    const dismissedJobIds = new Set(stored?.dismissedJobIds);
    return countUnloggedDeliveries(jobs, states, { blueprintTypeId, dismissedJobIds });
  }, [stored, runs, characterId, blueprintTypeId]);
}
