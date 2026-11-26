import { placeRemaps, type PlaceRemapsOptions } from '@/engine/optimizer';
import type { PlanEntry } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';
import { pricedAfterApply } from './optimizeHelpers';
import { newPlan } from './newPlan';
import { schedulePlanWith, type PlanScheduleInputs } from './planSchedule';
import { remapBudget, type RemapAvailability } from './remapAvailability';
import { applyOptimizerRemapSegments } from './skillPlanEdit';

interface OptimizeQueueArgs {
  entries: readonly PlanEntry[];
  inputs: PlanScheduleInputs;
  remapInfo: RemapAvailability | null;
  nowMs: number;
  characterId: number;
  name: string;
}

export type OptimizeQueueOutcome =
  | { kind: 'empty' }
  | { kind: 'optimal' }
  | {
      kind: 'plan';
      plan: SkillPlanRecord;
      savingsSeconds: number;
      remapsPlaced: number;
      firstRemapEntry: PlanEntry | undefined;
      yearlyRemapAfter?: Date;
    };

export function optimizeQueuePlan({
  entries,
  inputs,
  remapInfo,
  nowMs,
  characterId,
  name,
}: OptimizeQueueArgs): OptimizeQueueOutcome {
  if (entries.length === 0) return { kind: 'empty' };
  const budget = remapBudget(remapInfo, 0, new Date(nowMs));
  if (budget.evaluatedCount <= 0) return { kind: 'optimal' };
  const base = newPlan(characterId, name, budget.count);
  base.entries = [...entries];
  const options: PlaceRemapsOptions = {
    remapCount: budget.evaluatedCount,
    currentAttributes: inputs.attributes,
    implants: inputs.implants,
    cloneState: inputs.cloneState,
    timedRemap: budget.timed ?? undefined,
  };
  const { engineSkills } = inputs.catalog;
  const schedule = schedulePlanWith(base, inputs, nowMs);
  const searched = placeRemaps(schedule.scheduled, engineSkills, options);
  const patch = applyOptimizerRemapSegments(
    base,
    searched.segments,
    engineSkills,
    inputs.trained,
    options
  );
  const markers = patch.markers ?? [];
  const { remaps } = pricedAfterApply(
    {
      schedulablePlan: base,
      scheduleInputs: inputs,
      loadedAtMs: nowMs,
      attributes: inputs.attributes,
    },
    base.entries,
    markers
  );
  if (markers.length === 0 || remaps.savingsSeconds < MIN_MEANINGFUL_SAVINGS_SECONDS) {
    return { kind: 'optimal' };
  }
  const usedTimedRemap =
    !!budget.timed && remaps.segments.filter((s) => s.remap).length >= budget.timed.remapCount;
  const plan: SkillPlanRecord = {
    ...base,
    markers,
    markerAttributes: patch.markerAttributes ?? [],
  };
  return {
    kind: 'plan',
    plan,
    savingsSeconds: remaps.savingsSeconds,
    remapsPlaced: markers.length,
    firstRemapEntry: base.entries[markers[0]!],
    yearlyRemapAfter:
      usedTimedRemap && remapInfo?.cooldownUntil ? remapInfo.cooldownUntil : undefined,
  };
}
