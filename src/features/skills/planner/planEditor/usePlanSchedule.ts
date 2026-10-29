import { useMemo, useState } from 'react';
import type { SkillPlanRecord, WhatIfImplantSelection } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import { projectQueueEnd } from '@/engine/skills/queueStatus';
import type { Attributes, CloneState, Implants, TrainedSkill } from '@/engine/types';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { SkillCatalog } from '../../skillMap';
import { schedulePlanWith, type PlanScheduleInputs, type SchedulablePlan } from '../planSchedule';
import { pinnedInProgressEntry } from '../queueRows';
import { DEFAULT_WHAT_IF_SELECTION, isHypotheticalLens } from '../whatIfImplants';

export type PlanScheduleResult = ReturnType<typeof schedulePlanWith>;

/** Costs the plan once (and once more on the real implants while the What-If lens is hypothetical). */
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
}: {
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  queueEntries: readonly SkillQueueEntry[];
  attributes: Attributes;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  cloneState: CloneState;
  whatIf: WhatIfImplantSelection;
}) {
  // The queue's lead (the levels ahead of the first one this plan lists)
  // trains first, so the plan starts when it ends. One instant feeds the schedule,
  // Optimize Remaps' Booster origin, so the savings figure and the total agree.
  const [loadedAtMs] = useState(() => Date.now());
  const queueProjection = useMemo(
    () => projectQueueEnd(trainedSkills, queueEntries, loadedAtMs, plan.entries),
    [trainedSkills, queueEntries, loadedAtMs, plan.entries]
  );
  // The plan entry that IS the in-game queue's currently-training level, if
  // any (#1701 follow-up) — EntryList shows its real remaining time instead
  // of a bare, misleading "0m" for the zero own-steps that entry contributes.
  const pinnedInProgress = useMemo(
    () => pinnedInProgressEntry(plan.entries, queueProjection, loadedAtMs),
    [plan.entries, queueProjection, loadedAtMs]
  );
  // The one inputs literal every costing below shares (the schedule, the
  // what-if "vs current" pass, Optimize remaps / Optimize for me re-prices), so
  // a new field cannot be wired at one site and missed at another. Implants go
  // in raw: `schedulePlan` applies the What-If lens itself.
  const schedulablePlan = useMemo<SchedulablePlan>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
      whatIfImplants: plan.whatIfImplants,
      booster: plan.booster,
      boosters: plan.boosters,
    }),
    [
      plan.entries,
      plan.markers,
      plan.markerAttributes,
      plan.whatIfImplants,
      plan.booster,
      plan.boosters,
    ]
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
    }),
    [catalog, trainedSkills, queueEntries, attributes, attributeBaseline, implants, cloneState]
  );
  // Costed by `schedulePlanWith`, the same costing the Calendar makes, so the
  // two can never quote different dates for one plan.
  const schedule = useMemo(
    () => schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs),
    [schedulablePlan, scheduleInputs, loadedAtMs]
  );
  // The what-if chip's "vs current" figure: one more pass of the same costing
  // against the clone's real implants, run only while the lens is hypothetical.
  const hypotheticalLens = isHypotheticalLens(whatIf);
  const currentLensSchedule = useMemo(
    () =>
      hypotheticalLens
        ? // Override: force the default (real-implants) lens, ignoring the plan's stored What-If.
          schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs, {
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
