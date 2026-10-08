/**
 * Live reads of the Job History (issue #2866): delivered jobs per Character,
 * and what the Production Log already holds for them.
 */
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

/** Every stored delivered job, tagged with its Character, plus the runs to classify them against. Both `undefined` until Dexie answers. */
export function useJobHistoryData(): {
  jobs: HistoryJobWithCharacter[] | undefined;
  runs: LoggedRunRef[] | undefined;
  /** Dismissed job ids across Characters (EVE job ids are globally unique). */
  dismissedJobIds: ReadonlySet<number>;
} {
  const history = useLiveQuery(() => db.industryJobHistory.toArray(), []);
  const runs = useLiveQuery(() => db.productionRuns.toArray(), []);
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

/** Logged/unlogged state per job id for `jobs`. */
export function useHistoryStates(
  jobs: readonly HistoryJob[],
  runs: readonly LoggedRunRef[] | undefined
): Map<number, HistoryJobState> {
  return useMemo(() => classifyHistoryJobs(jobs, runs ?? NONE), [jobs, runs]);
}

/** How many delivered jobs of one blueprint the Character never logged — the Build Plan page's badge. 0 until Dexie answers. */
export function useUnloggedDeliveryCount(characterId: number, blueprintTypeId: number): number {
  const stored = useLiveQuery(() => db.industryJobHistory.get(characterId), [characterId]);
  const runs = useLiveQuery(
    () => db.productionRuns.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  return useMemo(() => {
    const jobs = (stored?.jobs ?? []).map((job) => ({ ...job, characterId }));
    const states = classifyHistoryJobs(jobs, runs ?? NONE);
    const dismissedJobIds = new Set(stored?.dismissedJobIds);
    return countUnloggedDeliveries(jobs, states, { blueprintTypeId, dismissedJobIds });
  }, [stored, runs, characterId, blueprintTypeId]);
}
