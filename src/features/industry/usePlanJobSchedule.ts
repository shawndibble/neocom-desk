import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { planJobNodes, usePlanSchedule } from './planJobSlots';
import { planOwnedBlueprints, type CorpBlueprintSource } from './resolveBuildPlan';

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
              jobRuns: result.jobRuns,
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
