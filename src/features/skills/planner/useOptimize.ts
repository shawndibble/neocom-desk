import { useTranslation } from 'react-i18next';
import {
  placeRemaps,
  suggestReorder,
  type OptimizeForMeResult,
  type PlaceRemapsOptions,
  type PlaceRemapsResult,
} from '@/engine/optimizer';
import type { StepKey } from '@/engine/skills/skillPlanSchedule';
import type { EngineSkill, PlanStep, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { useTimeZone } from '@/lib/timeFormat';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import {
  anchorKeysOf,
  confirmRemapOutcome,
  pricedAfterApply,
  type PricingContext,
} from './optimizeHelpers';
import { remapVerdict, type OptimizeVerdict } from './optimizeVerdict';
import type { RemapAvailability, remapBudget } from './remapAvailability';
import { applyReorderSuggestion } from './reorder';
import { schedulePlanWith } from './planSchedule';
import {
  applyOptimizeForMe,
  applyOptimizerRemapSegments,
  applyRemapSegments,
  type SkillPlanEditable,
} from './skillPlanEdit';
import { useScopedState } from './useScopedState';

interface OptimizeEnv {
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  editable: SkillPlanEditable;
  scheduled: readonly PlanStep[];
  onUpdate: (patch: Partial<SkillPlanRecord>) => void | Promise<void>;
}

export type OptimizeRun = PlaceRemapsResult & {
  anchorKeys: (StepKey | undefined)[];
  yearlyRemapAfter?: Date;
};

interface UseOptimizeRemapsArgs extends OptimizeEnv {
  costingScope: readonly unknown[];
  buildRemapOptions: () => PlaceRemapsOptions;
  remapCount: number;
  timedRemap: ReturnType<typeof remapBudget>['timed'];
  remapInfo: RemapAvailability | null;
  pricing: PricingContext;
  stepKeys: readonly StepKey[];
}

export function useOptimizeRemaps({
  engineSkills,
  trainedSkills,
  editable,
  scheduled,
  onUpdate,
  costingScope,
  buildRemapOptions,
  remapCount,
  timedRemap,
  remapInfo,
  pricing,
  stepKeys,
}: UseOptimizeRemapsArgs) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [optimizeResult, setOptimizeResult] = useScopedState<OptimizeRun>(costingScope);
  const [optimizeVerdict, setOptimizeVerdict] = useScopedState<OptimizeVerdict>(costingScope);
  const [optimizeConfirm, setOptimizeConfirm] = useScopedState<string>(costingScope);
  const { show: showOptimizeConfirm } = useAutoDismiss<string | null>(setOptimizeConfirm, null);

  function handleOptimizeRemaps() {
    if (scheduled.length === 0) return;
    const searched = placeRemaps(scheduled, engineSkills, buildRemapOptions());
    const patch = applyOptimizerRemapSegments(
      editable,
      searched.segments,
      engineSkills,
      trainedSkills,
      buildRemapOptions()
    );
    const { remaps: result } = pricedAfterApply(pricing, editable.entries, patch.markers ?? []);
    const verdict = remapVerdict(result, remapCount);
    const usedTimedRemap =
      !!timedRemap && result.segments.filter((s) => s.remap).length >= timedRemap.remapCount;
    const yearlyRemapAfter =
      usedTimedRemap && remapInfo?.cooldownUntil ? remapInfo.cooldownUntil : undefined;
    setOptimizeResult({
      ...result,
      anchorKeys: anchorKeysOf(stepKeys, result.segments),
      yearlyRemapAfter,
    });
    setOptimizeVerdict(verdict);
    showOptimizeConfirm(confirmRemapOutcome(t, verdict, yearlyRemapAfter, timeZone));
  }

  function acceptOptimizeRemaps() {
    if (!optimizeResult) return;
    onUpdate(
      applyOptimizerRemapSegments(
        editable,
        optimizeResult.segments,
        engineSkills,
        trainedSkills,
        buildRemapOptions()
      )
    );
    setOptimizeResult(null);
    setOptimizeVerdict(null);
  }

  function rejectOptimizeRemaps() {
    setOptimizeResult(null);
    setOptimizeVerdict(null);
  }

  return {
    optimizeResult,
    optimizeVerdict,
    optimizeConfirm,
    handleOptimizeRemaps,
    acceptOptimizeRemaps,
    rejectOptimizeRemaps,
  };
}

interface UseOptimizeForMeArgs extends OptimizeEnv {
  costingScope: readonly unknown[];
  buildRemapOptions: () => PlaceRemapsOptions;
  pricing: PricingContext;
  priorityMap: ReturnType<typeof schedulePlanWith>['priorityMap'];
  milestones: SkillPlanRecord['milestones'];
  loadedAtMs: number;
}

export function useOptimizeForMe({
  engineSkills,
  trainedSkills,
  editable,
  scheduled,
  onUpdate,
  costingScope,
  buildRemapOptions,
  pricing,
  priorityMap,
  milestones,
  loadedAtMs,
}: UseOptimizeForMeArgs) {
  const [optimizeForMePreview, setOptimizeForMePreview] =
    useScopedState<OptimizeForMeResult>(costingScope);

  function handleOptimizeForMe() {
    if (scheduled.length === 0) return;
    const suggested = suggestReorder(scheduled, engineSkills, priorityMap, milestones);
    const reorderedEntries = applyReorderSuggestion(editable.entries, suggested);
    const reorderedSchedule = schedulePlanWith(
      pricing.schedulablePlan,
      pricing.scheduleInputs,
      loadedAtMs,
      { entries: reorderedEntries }
    );
    const order = reorderedSchedule.scheduled;
    const searched = placeRemaps(order, engineSkills, buildRemapOptions());
    const patch = applyOptimizeForMe(
      editable,
      order,
      searched.segments,
      engineSkills,
      trainedSkills,
      buildRemapOptions()
    );
    setOptimizeForMePreview(
      pricedAfterApply(pricing, patch.entries ?? reorderedEntries, patch.markers ?? [])
    );
  }

  function acceptOptimizeForMe() {
    if (!optimizeForMePreview) return;
    onUpdate(
      applyOptimizeForMe(
        editable,
        optimizeForMePreview.order,
        optimizeForMePreview.remaps.segments,
        engineSkills,
        trainedSkills,
        buildRemapOptions()
      )
    );
    setOptimizeForMePreview(null);
  }

  function rejectOptimizeForMe() {
    setOptimizeForMePreview(null);
  }

  return { optimizeForMePreview, handleOptimizeForMe, acceptOptimizeForMe, rejectOptimizeForMe };
}

interface UseOptimizeAtMarkersArgs extends OptimizeEnv {
  planScope: readonly unknown[];
  markersAtCurrentPositions: PlaceRemapsResult | null;
  markersVerdict: OptimizeVerdict | null;
}

export function useOptimizeAtMarkers({
  engineSkills,
  trainedSkills,
  editable,
  scheduled,
  onUpdate,
  planScope,
  markersAtCurrentPositions,
  markersVerdict,
}: UseOptimizeAtMarkersArgs) {
  const [markersPanelOpenHeld, setMarkersPanelOpen] = useScopedState<boolean>(planScope);
  const markersPanelOpen = markersPanelOpenHeld ?? false;

  function handleOptimizeAtMarkers() {
    if (scheduled.length === 0 || !markersVerdict) return;
    setMarkersPanelOpen(true);
  }

  function acceptOptimizeAtMarkers() {
    if (!markersAtCurrentPositions) return;
    onUpdate(
      applyRemapSegments(editable, markersAtCurrentPositions.segments, engineSkills, trainedSkills)
    );
    setMarkersPanelOpen(false);
  }

  function rejectOptimizeAtMarkers() {
    setMarkersPanelOpen(false);
  }

  return {
    markersPanelOpen,
    handleOptimizeAtMarkers,
    acceptOptimizeAtMarkers,
    rejectOptimizeAtMarkers,
  };
}
