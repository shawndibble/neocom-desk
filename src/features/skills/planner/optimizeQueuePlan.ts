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
  /** The live skill queue as plan entries, already deduped. */
  entries: readonly PlanEntry[];
  inputs: PlanScheduleInputs;
  remapInfo: RemapAvailability | null;
  nowMs: number;
  characterId: number;
  name: string;
}

export type OptimizeQueueOutcome =
  /** Nothing is queued, so there is nothing to optimize. */
  | { kind: 'empty' }
  /** No remap makes the queue meaningfully faster, so no plan is worth making. */
  | { kind: 'optimal' }
  | {
      kind: 'plan';
      plan: SkillPlanRecord;
      savingsSeconds: number;
      remapsPlaced: number;
      /** The entry the first Remap Marker sits in front of. */
      firstRemapEntry: PlanEntry | undefined;
      /** Set when the last remap is the on-cooldown yearly one: the date it becomes usable. */
      yearlyRemapAfter?: Date;
    };

/**
 * "Optimize queue": a Skill Plan made from the live skill queue with the
 * best Remap Markers already placed. Remaps are placed on the plan's own
 * schedule, which waits only on the live queue, and re-priced the way the
 * editor prices them, so the savings quoted here are the ones the plan shows.
 */
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
