/**
 * Recorded-runs count per Build Plan, for the Industry index's Runs column.
 * One `characterId`-indexed query (the same one `ProductionLogPanel` already
 * runs), folded through `countRunsByPlan` rather than one `.where('buildPlanId')`
 * query per row — cheap regardless of how many plans the index is showing.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { countRunsByPlan } from './productionRunSummary';

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

export function useRunCountsByPlan(characterId: number): ReadonlyMap<string, number> {
  const runs = useLiveQuery(
    () => db.productionRuns.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  return useMemo(() => (runs ? countRunsByPlan(runs) : EMPTY_COUNTS), [runs]);
}
