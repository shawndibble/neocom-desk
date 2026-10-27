import { useEffect, useMemo, useState } from 'react';
import type { SkillPlanRecord } from '@/db';
import { cloneStateFor, useCloneStates } from '../cloneState';
import type { PlanRowStats } from './PlanList';
import { schedulePlan, type PlanScheduleInputs } from './planSchedule';

export type PlanStatsInputs = Omit<PlanScheduleInputs, 'cloneState'> & {
  trainedSkillsKnown: boolean;
};

/**
 * Each plan's total time and finish, costed by `schedulePlan` — the call the
 * editor and Calendar make, so every surface agrees. `undefined` until it can
 * be costed honestly: held back until ESI has answered and Clone State is
 * read, since costing against the empty stand-ins would flash catalog-only,
 * Omega-default figures. Also `undefined` when `inputs` is omitted.
 *
 * `onlyPlanIds` limits costing to those plans — a surface showing one plan
 * need not schedule them all. Compared by content, so a fresh array of the
 * same ids does not reschedule.
 */
export function usePlanStats(
  plans: readonly SkillPlanRecord[] | undefined,
  inputs: PlanStatsInputs | undefined,
  characterId: number,
  onlyPlanIds?: readonly string[]
): Map<string, PlanRowStats> | undefined {
  const enabled = inputs !== undefined;
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useCloneStates((state) => state.hydrated);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    if (enabled) void hydrateCloneStates();
  }, [enabled, hydrateCloneStates]);
  // One instant per mount, like the editor, so the figures match its summary.
  const [loadedAtMs] = useState(() => Date.now());
  const onlyKey = onlyPlanIds?.join('\n');
  return useMemo(() => {
    if (!plans || !inputs?.trainedSkillsKnown || !cloneStatesHydrated) return undefined;
    const scheduleInputs: PlanScheduleInputs = {
      catalog: inputs.catalog,
      trained: inputs.trained,
      queueEntries: inputs.queueEntries,
      attributes: inputs.attributes,
      attributeBaseline: inputs.attributeBaseline,
      implants: inputs.implants,
      cloneState: cloneStateFor(cloneStates, characterId),
    };
    const out = new Map<string, PlanRowStats>();
    const only = onlyKey === undefined ? undefined : new Set(onlyKey.split('\n'));
    for (const plan of plans) {
      if (only && !only.has(plan.id)) continue;
      const schedule = schedulePlan(plan, scheduleInputs, loadedAtMs);
      if (schedule.error === null || schedule.error === undefined) {
        out.set(plan.id, { totalSeconds: schedule.totalSeconds, finish: schedule.finish });
      }
    }
    return out;
  }, [plans, inputs, cloneStates, cloneStatesHydrated, characterId, loadedAtMs, onlyKey]);
}
