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
  const [editingMarkerIndex, setEditingMarkerIndex] = useState<number | null>(null);

  const normalizedMarkerAttributes = useMemo(() => alignedMarkerAttributes(editable), [editable]);

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

  const markerAttributesByStepIndex = useMemo(() => {
    if (!markersOptimizerSpread) return null;
    return new Map(
      markersOptimizerSpread.segments
        .filter((s) => s.remap)
        .map((s) => [s.startIndex, s.attributes])
    );
  }, [markersOptimizerSpread]);
  const markerStepIndicesForResult = markersOptimizerSpread ? schedule.markerStepIndices : null;
  function computedMarkerAttributesFor(markerIndex: number): Attributes | undefined {
    const stepIndex = markerStepIndicesForResult?.[markerIndex];
    return stepIndex === undefined ? undefined : markerAttributesByStepIndex?.get(stepIndex);
  }

  function markerAttributesFor(markerIndex: number): Attributes | undefined {
    return normalizedMarkerAttributes[markerIndex] ?? computedMarkerAttributesFor(markerIndex);
  }

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
