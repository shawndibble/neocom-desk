import { useMemo, useState } from 'react';
import type { CharacterAcceleratorRecord, SkillPlanRecord, WhatIfImplantSelection } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import { projectQueueEnd } from '@/engine/skills/queueStatus';
import type { Attributes, CloneState, Implants, TrainedSkill } from '@/engine/types';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { SkillCatalog } from '../../skillMap';
import { schedulePlanWith, type PlanScheduleInputs, type SchedulablePlan } from '../planSchedule';
import { pinnedInProgressEntry } from '../queueRows';
import { DEFAULT_WHAT_IF_SELECTION, isHypotheticalLens } from '../whatIfImplants';

export type PlanScheduleResult = ReturnType<typeof schedulePlanWith>;

export function usePlanSchedule({
  plan,
  catalog,
  trainedSkills,
  queueEntries,
  attributes,
  attributeBaseline,
  implants,
  cloneState,
  whatIf,
  accelerator,
}: {
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  queueEntries: readonly SkillQueueEntry[];
  attributes: Attributes;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  accelerator: CharacterAcceleratorRecord | null;
  cloneState: CloneState;
  whatIf: WhatIfImplantSelection;
}) {
  const [loadedAtMs] = useState(() => Date.now());
  const queueProjection = useMemo(
    () => projectQueueEnd(trainedSkills, queueEntries, loadedAtMs, plan.entries),
    [trainedSkills, queueEntries, loadedAtMs, plan.entries]
  );
  const pinnedInProgress = useMemo(
    () => pinnedInProgressEntry(plan.entries, queueProjection, loadedAtMs),
    [plan.entries, queueProjection, loadedAtMs]
  );
  const schedulablePlan = useMemo<SchedulablePlan>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
      whatIfImplants: plan.whatIfImplants,
    }),
    [plan.entries, plan.markers, plan.markerAttributes, plan.whatIfImplants]
  );
  const scheduleInputs = useMemo<PlanScheduleInputs>(
    () => ({
      catalog,
      trained: trainedSkills,
      queueEntries,
      attributes,
      attributeBaseline,
      implants,
      cloneState,
      accelerator,
    }),
    [
      catalog,
      trainedSkills,
      queueEntries,
      attributes,
      attributeBaseline,
      implants,
      cloneState,
      accelerator,
    ]
  );
  const schedule = useMemo(
    () => schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs),
    [schedulablePlan, scheduleInputs, loadedAtMs]
  );
  const hypotheticalLens = isHypotheticalLens(whatIf);
  const currentLensSchedule = useMemo(
    () =>
      hypotheticalLens
        ? schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs, {
            whatIfImplants: DEFAULT_WHAT_IF_SELECTION,
          })
        : null,
    [hypotheticalLens, schedulablePlan, scheduleInputs, loadedAtMs]
  );
  const currentLensTotalSeconds = currentLensSchedule?.totalSeconds ?? null;

  return {
    loadedAtMs,
    queueProjection,
    pinnedInProgress,
    schedulablePlan,
    scheduleInputs,
    schedule,
    currentLensSchedule,
    currentLensTotalSeconds,
  };
}
