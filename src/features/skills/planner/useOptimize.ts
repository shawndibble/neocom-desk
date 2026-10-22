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

/** What every optimize flow reads and writes: the plan's edit surface and the engine's inputs. */
interface OptimizeEnv {
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  editable: SkillPlanEditable;
  scheduled: readonly PlanStep[];
  onUpdate: (patch: Partial<SkillPlanRecord>) => void | Promise<void>;
}

/** An Optimize Remaps result, with each segment's first step held by key rather than index. */
export type OptimizeRun = PlaceRemapsResult & {
  anchorKeys: (StepKey | undefined)[];
  /** Set when this run's last remap is the on-cooldown yearly one — the modal notes its date. */
  yearlyRemapAfter?: Date;
};

interface UseOptimizeRemapsArgs extends OptimizeEnv {
  /** Results read as null once this scope moves on (plan swapped or edited, Clone State flipped). */
  costingScope: readonly unknown[];
  buildRemapOptions: () => PlaceRemapsOptions;
  remapCount: number;
  timedRemap: ReturnType<typeof remapBudget>['timed'];
  remapInfo: RemapAvailability | null;
  pricing: PricingContext;
  stepKeys: readonly StepKey[];
}

/** Optimize Remaps: search remap placement on the current order, preview it, Accept/Reject. */
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
  // Why each result came out the way it did (optimizeVerdict.ts). Held
  // beside the result rather than derived at render: the verdict depends on
  // the Remaps Available the run actually used, and the user can edit that
  // input afterwards without invalidating the result itself.
  const [optimizeVerdict, setOptimizeVerdict] = useScopedState<OptimizeVerdict>(costingScope);
  // Beside-the-button confirmation (#222) for Optimize Remaps.
  const [optimizeConfirm, setOptimizeConfirm] = useScopedState<string>(costingScope);
  const { show: showOptimizeConfirm } = useAutoDismiss<string | null>(setOptimizeConfirm, null);

  // A "saves" verdict now also opens its own Accept/Reject Modal (below),
  // beside this beside-the-button confirmation (#222) — the same pairing
  // "Suggest reorder" already uses: an instant toast plus the Modal that
  // holds the actual decision.
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
    // Whether the timed (on-cooldown yearly) slot actually ended up used:
    // every remap up to `timedRemap.remapCount` counted, not just requested.
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

  /**
   * Accept on the Optimize Remaps preview Modal: turn the SEARCH's own
   * RemapSegments into actual Remap Markers. Its boundaries can land mid-entry
   * (a prereq chain spanning two attribute pairs) and snap forward to the
   * entry after it, which can leave a marker whose re-priced spread matches
   * the one before it — `applyOptimizerRemapSegments` drops that marker,
   * since it is the search's own proposal, never a manual one.
   */
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

  /** Reject on the Optimize Remaps preview Modal: dismiss without applying. */
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

/** Optimize for me: priority-respecting reorder, then remap placement, previewed as one Accept/Reject. */
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
  // Own scoped state, not `optimizeResult`'s shape: that one anchors segments
  // to the current order's step keys, which a hypothetical reorder has none of yet.
  const [optimizeForMePreview, setOptimizeForMePreview] =
    useScopedState<OptimizeForMeResult>(costingScope);

  /**
   * Priority-respecting reorder, then remap placement on that new order,
   * previewed as one Accept/Reject. `placeRemaps` runs on the order's own
   * re-expansion (via `schedulePlan`, the same costing `scheduled` itself
   * goes through), not on `suggestReorder`'s raw step list: a prereq chain
   * can straddle two attribute pairs inside one entry, so the entries
   * `applyReorderSuggestion` reconstructs from a step order don't always
   * re-expand to that exact same order. The preview itself is then re-priced
   * through `pricedAfterApply` against the exact `(entries, markers)` Accept
   * will write, so a marker `applyOptimizerRemapSegments` drops as redundant
   * never shows up as a promised remap here either.
   */
  function handleOptimizeForMe() {
    if (scheduled.length === 0) return;
    const suggested = suggestReorder(scheduled, engineSkills, priorityMap, milestones);
    const reorderedEntries = applyReorderSuggestion(editable.entries, suggested);
    // Override: only the reordered entries; the plan's own markers and marker
    // attributes stay, since the new order is re-expanded before remaps are searched.
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

  /** Accept on the "Optimize for me" preview Modal: one write, new order and remap markers together. */
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
  /** Null until the plan has a marker to cost. */
  markersVerdict: OptimizeVerdict | null;
}

/** Optimize at my markers: re-cost the plan's own markers, shown as a click-revealed Accept/Reject panel. */
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
  // Whether the "Optimize at my markers" savings/segments panel is showing.
  // The computation itself is not state — the schedule derives it live
  // from `plan.markers` so marker rows always have their target attributes on
  // hand — this flag exists purely to keep that panel an explicit,
  // click-revealed finding rather than something that pops up unasked the
  // moment a plan happens to carry any markers.
  const [markersPanelOpenHeld, setMarkersPanelOpen] = useScopedState<boolean>(planScope);
  const markersPanelOpen = markersPanelOpenHeld ?? false;

  function handleOptimizeAtMarkers() {
    if (scheduled.length === 0 || !markersVerdict) return;
    setMarkersPanelOpen(true);
  }

  /**
   * Accept on the Optimize at my markers preview Modal: re-costs the plan's
   * OWN markers wholesale (a no-op on position, since this round-trips them
   * through the same conversion `segmentsToMarkers` uses). Goes through
   * `applyRemapSegments`, not the redundant-marker-dropping variant: these
   * are markers the user placed themselves, and silently deleting one they
   * placed is not this accept's call to make.
   */
  function acceptOptimizeAtMarkers() {
    if (!markersAtCurrentPositions) return;
    onUpdate(
      applyRemapSegments(editable, markersAtCurrentPositions.segments, engineSkills, trainedSkills)
    );
    setMarkersPanelOpen(false);
  }

  /** Reject on the Optimize at my markers preview Modal: dismiss, changing nothing. */
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
