import { useMemo } from 'react';
import type { SkillPlanRecord } from '@/db';
import { planProgress } from '@/engine/skills/planProgress';
import type { Attributes, Booster, CloneState, Implants, TrainedSkill } from '@/engine/types';
import type { SkillCatalog } from '../../skillMap';
import { markerVerdict, type OptimizeVerdict } from '../optimizeVerdict';
import { evaluateOptimizationBadge, toOptimizationBadge } from '../planHeaderStats';
import type { usePlanOptimize } from './usePlanOptimize';
import type { PlanScheduleResult } from './usePlanSchedule';

export function usePlanHeaderStats({
  plan,
  catalog,
  trainedSkills,
  attributes,
  implants,
  effectiveImplants,
  cloneState,
  activeBoosters,
  schedule,
  currentLensSchedule,
  markersVerdict,
  optimize,
}: {
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  effectiveImplants: Implants;
  cloneState: CloneState;
  activeBoosters: readonly Booster[];
  schedule: PlanScheduleResult;
  currentLensSchedule: PlanScheduleResult | null;
  markersVerdict: OptimizeVerdict | null;
  optimize: ReturnType<typeof usePlanOptimize>;
}) {
  const { scheduled, markersResult: markersAtCurrentPositions } = schedule;
  const { optimizeResult, remapCount, requestedRemapCount, timedRemap } = optimize;
  const headerProgress = useMemo(
    () => planProgress(plan.entries, catalog.engineSkills, trainedSkills),
    [plan.entries, catalog.engineSkills, trainedSkills]
  );

  const headerBadge = useMemo(() => {
    if (markersAtCurrentPositions && markersVerdict?.kind !== 'markersAtEnd') {
      const markerCount = markersAtCurrentPositions.segments.filter((s) => s.remap).length;
      return toOptimizationBadge(
        markersAtCurrentPositions.savingsSeconds,
        markerCount,
        markerCount
      );
    }
    if (requestedRemapCount <= 0) return null;
    if (activeBoosters.length > 0) {
      return optimizeResult
        ? toOptimizationBadge(optimizeResult.savingsSeconds, remapCount, requestedRemapCount)
        : null;
    }
    return evaluateOptimizationBadge(scheduled, catalog.engineSkills, {
      remapCount: requestedRemapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
      timedRemap: timedRemap ?? undefined,
    });
  }, [
    markersAtCurrentPositions,
    markersVerdict,
    activeBoosters,
    optimizeResult,
    remapCount,
    requestedRemapCount,
    scheduled,
    catalog,
    attributes,
    effectiveImplants,
    cloneState,
    timedRemap,
  ]);

  const realLensSavingsSeconds = useMemo(() => {
    if (!currentLensSchedule || activeBoosters.length > 0) return null;
    const { markersResult, scheduled: realScheduled } = currentLensSchedule;
    if (markersResult && markerVerdict(markersResult).kind !== 'markersAtEnd') {
      return markersResult.savingsSeconds;
    }
    if (requestedRemapCount <= 0) return null;
    return (
      evaluateOptimizationBadge(realScheduled, catalog.engineSkills, {
        remapCount: requestedRemapCount,
        currentAttributes: attributes,
        implants,
        cloneState,
        timedRemap: timedRemap ?? undefined,
      })?.savingsSeconds ?? null
    );
  }, [
    currentLensSchedule,
    activeBoosters,
    requestedRemapCount,
    catalog,
    attributes,
    implants,
    cloneState,
    timedRemap,
  ]);

  return { headerProgress, headerBadge, realLensSavingsSeconds };
}
