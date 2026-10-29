import { useMemo, useState } from 'react';
import type { SkillPlanRecord } from '@/db';
import { optimizeAtMarkers } from '@/engine/optimizer';
import type { Attributes, CloneState, EngineSkill, Implants } from '@/engine/types';
import { markerVerdict } from '../optimizeVerdict';
import {
  alignedMarkerAttributes,
  setRemapMarkerAttributes,
  type SkillPlanEditable,
} from '../skillPlanEdit';
import type { PlanEditorProps } from './types';
import type { PlanScheduleResult } from './usePlanSchedule';

/** Remap Markers' attributes: the manual overrides, what the optimizer would pick, and the editor modal's target. */
export function useRemapMarkers({
  markers,
  schedule,
  engineSkills,
  attributes,
  effectiveImplants,
  cloneState,
  editable,
  onUpdate,
}: {
  markers: SkillPlanRecord['markers'];
  schedule: PlanScheduleResult;
  engineSkills: ReadonlyMap<number, EngineSkill>;
  attributes: Attributes;
  effectiveImplants: Implants;
  cloneState: CloneState;
  editable: SkillPlanEditable;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  const { scheduled, markersResult: markersAtCurrentPositions } = schedule;
  // Which marker's manual attribute editor (RemapMarkerModal) is open, by
  // ordinal — the same addressing `onRemoveMarker`/`markerAttributesFor` use.
  const [editingMarkerIndex, setEditingMarkerIndex] = useState<number | null>(null);

  // Manual overrides (RemapMarkerModal), aligned to the current markers.
  const normalizedMarkerAttributes = useMemo(() => alignedMarkerAttributes(editable), [editable]);

  // `markersAtCurrentPositions` (from the schedule, above) already carries a
  // manual override's real attributes when one is set — exactly what the
  // savings badge and Accept must cost against (#1232). But RemapMarkerModal
  // needs the OTHER half for a marker that already has an override: what the
  // optimizer would pick absent that override, to seed a fresh edit without
  // it being mistaken for the existing one. This is a second, override-blind
  // (and Booster-blind) run of the same bounded per-segment search — cheap,
  // unlike `placeRemaps`'s DP — kept only for that seeding purpose.
  const markersOptimizerSpread = useMemo(() => {
    if (!markers || markers.length === 0) return null;
    return optimizeAtMarkers(scheduled, engineSkills, {
      markers: schedule.markerStepIndices,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
    });
  }, [
    markers,
    scheduled,
    schedule.markerStepIndices,
    engineSkills,
    attributes,
    effectiveImplants,
    cloneState,
  ]);
  const markersVerdict = useMemo(
    () => (markersAtCurrentPositions ? markerVerdict(markersAtCurrentPositions) : null),
    [markersAtCurrentPositions]
  );

  /**
   * A marker's target attributes, keyed by STEP INDEX, not by ordinal
   * position: `optimizeAtMarkers` dedupes its cut points
   * (`[...new Set(...)]`), so two distinct markers collapse into one remap
   * segment whenever an entry between them contributes no step (already
   * trained, or missing from the catalog) — the two then sit at the same
   * step index. Indexing the remapped segments by ordinal position would
   * misattribute every marker after such a collision to the wrong segment;
   * both colliding markers correctly show the one segment they actually
   * share.
   */
  const markerAttributesByStepIndex = useMemo(() => {
    if (!markersOptimizerSpread) return null;
    return new Map(
      markersOptimizerSpread.segments
        .filter((s) => s.remap)
        .map((s) => [s.startIndex, s.attributes])
    );
  }, [markersOptimizerSpread]);
  const markerStepIndicesForResult = markersOptimizerSpread ? schedule.markerStepIndices : null;
  /** What "Optimize at my markers" computes for this marker, ignoring any manual override — RemapMarkerModal needs this half on its own so it can seed a fresh edit from the optimizer's spread without that spread being mistaken for an existing override. */
  function computedMarkerAttributesFor(markerIndex: number): Attributes | undefined {
    const stepIndex = markerStepIndicesForResult?.[markerIndex];
    return stepIndex === undefined ? undefined : markerAttributesByStepIndex?.get(stepIndex);
  }

  /** A manual override always wins — it is the user overriding the optimizer, not the other way around. */
  function markerAttributesFor(markerIndex: number): Attributes | undefined {
    return normalizedMarkerAttributes[markerIndex] ?? computedMarkerAttributesFor(markerIndex);
  }

  /** RemapMarkerModal's Save/Clear: set (or clear, via `null`) marker `markerIndex`'s manual override. */
  function handleSaveMarkerAttributes(markerIndex: number, attributes: Attributes | null) {
    onUpdate(setRemapMarkerAttributes(editable, markerIndex, attributes));
  }

  return {
    editingMarkerIndex,
    setEditingMarkerIndex,
    normalizedMarkerAttributes,
    markersVerdict,
    computedMarkerAttributesFor,
    markerAttributesFor,
    handleSaveMarkerAttributes,
  };
}
