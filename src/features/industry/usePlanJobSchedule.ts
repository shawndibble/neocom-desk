import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { planJobNodes, usePlanSchedule } from './planJobSlots';
import { planOwnedBlueprints, type CorpBlueprintSource } from './resolveBuildPlan';

/**
 * When the plan's jobs would finish given the pilot's free slots, and the
 * seconds from now that takes (`undefined` until the schedule is in hand).
 */
export function usePlanJobSchedule(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  activity: IndustryActivity,
  result: BuildResult | null,
  corpBlueprints: CorpBlueprintSource | undefined
) {
  const jobNodes = useMemo(
    () =>
      result
        ? planJobNodes(
            {
              activity,
              seconds: result.seconds,
              materials: result.materials,
              blueprintTypeID: plan.blueprintTypeID,
            },
            catalog
          )
        : [],
    [result, activity, catalog, plan.blueprintTypeID]
  );
  const planCorpBlueprints = useMemo(
    () => planOwnedBlueprints({ includeCorpAssets: plan.includeCorpAssets }, [], corpBlueprints),
    [plan.includeCorpAssets, corpBlueprints]
  );
  const planSchedule = usePlanSchedule(plan.characterId, jobNodes, planCorpBlueprints);
  const planSeconds = planSchedule
    ? (planSchedule.schedule.finishMs - planSchedule.nowMs) / 1000
    : undefined;
  return { planSchedule, planSeconds };
}
