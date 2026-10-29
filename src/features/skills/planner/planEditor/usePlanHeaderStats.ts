import { useMemo } from 'react';
import type { SkillPlanRecord } from '@/db';
import { planProgress } from '@/engine/skills/planProgress';
import type { Attributes, Booster, CloneState, Implants, TrainedSkill } from '@/engine/types';
import type { SkillCatalog } from '../../skillMap';
import { markerVerdict, type OptimizeVerdict } from '../optimizeVerdict';
import { evaluateOptimizationBadge, toOptimizationBadge } from '../planHeaderStats';
import type { usePlanOptimize } from './usePlanOptimize';
import type { PlanScheduleResult } from './usePlanSchedule';

/** What the plan header shows besides the totals: the remap-savings chip, the real-lens comparison and progress. */
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

  // Header badge: live (no click, no spinner) via Booster-blind costing —
  // the only path cheap enough to run on every render. A Booster expiring
  // mid-plan can push placeRemaps' Booster-aware DP into seconds of
  // synchronous work even at remapCount=1 (measured, not just the docstring's
  // estimate), so while a Booster is active the header instead reuses the
  // explicit "Optimize remaps" result (Booster-aware, computed on click) and
  // shows nothing until the user has clicked it once — never a stale or
  // wrong number, never a spinner.
  //
  // A plan whose markers actually split something gets its chip from them,
  // regardless of remapCount: a marker is the user's own remap decision, not
  // a hypothetical the optimizer proposes, so what it saves against training
  // everything on current attributes is the number that answers "how much is
  // this saving me". Markers all sitting at the plan's end remap nothing, so
  // that plan falls through to the budget path below rather than reporting a
  // 0 the chip would render as "None" — the "remapping cannot help this
  // plan" lie planHeaderStats.ts refuses to tell.
  const headerBadge = useMemo(() => {
    if (markersAtCurrentPositions && markersVerdict?.kind !== 'markersAtEnd') {
      const markerCount = markersAtCurrentPositions.segments.filter((s) => s.remap).length;
      return toOptimizationBadge(
        markersAtCurrentPositions.savingsSeconds,
        markerCount,
        markerCount
      );
    }
    // A plan with no remaps to spend gets no chip on either path — the rule
    // and the reasoning live in evaluateOptimizationBadge, but the Booster
    // branch below never reaches it. Gated on the REQUESTED count: a plan
    // with 0 bonus remaps and the yearly one on cooldown still has one to
    // spend once the cooldown offset is honored.
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

  // The remap saving the header would show on the clone's real implants, so a
  // what-if lens that shrinks it can say why (`remapSavingsShrank`). Mirrors
  // `headerBadge`'s two Booster-blind paths; with a Booster active there is no
  // live figure on either side, so no comparison.
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
