import { useMemo } from 'react';
import type { SkillPlanRecord } from '@/db';
import type { PlaceRemapsOptions } from '@/engine/optimizer';
import type { projectQueueEnd } from '@/engine/skills/queueStatus';
import type {
  Attributes,
  Booster,
  CloneState,
  EngineSkill,
  Implants,
  TrainedSkill,
} from '@/engine/types';
import type { PricingContext } from '../optimizeHelpers';
import type { OptimizeVerdict } from '../optimizeVerdict';
import type { PlanScheduleInputs, SchedulablePlan } from '../planSchedule';
import { remapBudget, type RemapAvailability } from '../remapAvailability';
import type { SkillPlanEditable } from '../skillPlanEdit';
import { useOptimizeAtMarkers, useOptimizeForMe, useOptimizeRemaps } from '../useOptimize';
import { useReorder } from '../useReorder';
import type { PlanEditorProps } from './types';
import type { PlanScheduleResult } from './usePlanSchedule';

/**
 * Every optimize flow the Optimize menu offers (Optimize remaps, Optimize for me,
 * reorder / shortest-first, Optimize at my markers), sharing one remap budget, one set of
 * remap-placement inputs and one pricing context.
 */
export function usePlanOptimize({
  plan,
  engineSkills,
  trainedSkills,
  attributes,
  remapInfo,
  effectiveImplants,
  cloneState,
  activeBoosters,
  queueProjection,
  editable,
  schedule,
  schedulablePlan,
  scheduleInputs,
  loadedAtMs,
  planScope,
  costingScope,
  markersVerdict,
  onUpdate,
}: {
  plan: SkillPlanRecord;
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  remapInfo: RemapAvailability | null;
  effectiveImplants: Implants;
  cloneState: CloneState;
  activeBoosters: readonly Booster[];
  queueProjection: ReturnType<typeof projectQueueEnd>;
  editable: SkillPlanEditable;
  schedule: PlanScheduleResult;
  schedulablePlan: SchedulablePlan;
  scheduleInputs: PlanScheduleInputs;
  loadedAtMs: number;
  planScope: readonly unknown[];
  costingScope: readonly unknown[];
  markersVerdict: OptimizeVerdict | null;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  const { scheduled, priorityMap, markersResult: markersAtCurrentPositions } = schedule;
  // `new Date()` matches every other "plan starts now" read in this
  // component (e.g. `scheduleFromNow`). Memoized so its reference stays
  // stable across renders, not invalidating the header badge's own memo.
  const budget = useMemo(
    () => remapBudget(remapInfo, plan.remapCount, new Date()),
    [remapInfo, plan.remapCount]
  );
  // `requestedRemapCount` stays uncapped so `evaluateOptimizationBadge` can
  // tell a genuine over-cap request from one the timed remap alone accounts
  // for; `remapCount` is what the optimizer actually gets.
  const { timed: timedRemap, count: requestedRemapCount, evaluatedCount: remapCount } = budget;

  // Remap-placement inputs shared by every optimize flow that calls `placeRemaps` (directly, or via `optimizeForMe`).
  function buildRemapOptions(): PlaceRemapsOptions {
    return {
      remapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
      timedRemap: timedRemap ?? undefined,
      // The same Boosters the computed queue schedules with, so the savings
      // figure and the queue total cannot disagree.
      booster:
        activeBoosters.length > 0
          ? { boosters: activeBoosters, startDate: new Date(queueProjection.startMs) }
          : undefined,
    };
  }
  const pricing: PricingContext = { schedulablePlan, scheduleInputs, loadedAtMs, attributes };
  const optimizeEnv = {
    engineSkills: engineSkills,
    trainedSkills,
    editable,
    scheduled,
    onUpdate,
  };
  const {
    optimizeResult,
    optimizeVerdict,
    optimizeConfirm,
    handleOptimizeRemaps,
    acceptOptimizeRemaps,
    rejectOptimizeRemaps,
  } = useOptimizeRemaps({
    ...optimizeEnv,
    costingScope,
    buildRemapOptions,
    remapCount,
    timedRemap,
    remapInfo,
    pricing,
    stepKeys: schedule.stepKeys,
  });
  const { optimizeForMePreview, handleOptimizeForMe, acceptOptimizeForMe, rejectOptimizeForMe } =
    useOptimizeForMe({
      ...optimizeEnv,
      costingScope,
      buildRemapOptions,
      pricing,
      priorityMap,
      milestones: plan.milestones,
      loadedAtMs,
    });
  const {
    reorderConfirm,
    reorderPreview,
    setReorderPreview,
    handleSuggestReorder,
    handleSortShortest,
    acceptReorder,
  } = useReorder({
    planScope,
    engineSkills: engineSkills,
    editable,
    scheduled,
    priorityMap,
    milestones: plan.milestones,
    attributes,
    implants: effectiveImplants,
    cloneState,
    onUpdate,
    pricing,
    loadedAtMs,
  });

  const {
    markersPanelOpen,
    handleOptimizeAtMarkers,
    acceptOptimizeAtMarkers,
    rejectOptimizeAtMarkers,
  } = useOptimizeAtMarkers({
    ...optimizeEnv,
    planScope,
    markersAtCurrentPositions,
    markersVerdict,
  });

  return {
    requestedRemapCount,
    remapCount,
    timedRemap,
    optimizeResult,
    optimizeVerdict,
    optimizeConfirm,
    handleOptimizeRemaps,
    acceptOptimizeRemaps,
    rejectOptimizeRemaps,
    optimizeForMePreview,
    handleOptimizeForMe,
    acceptOptimizeForMe,
    rejectOptimizeForMe,
    reorderConfirm,
    reorderPreview,
    setReorderPreview,
    handleSuggestReorder,
    handleSortShortest,
    acceptReorder,
    markersPanelOpen,
    handleOptimizeAtMarkers,
    acceptOptimizeAtMarkers,
    rejectOptimizeAtMarkers,
  };
}
