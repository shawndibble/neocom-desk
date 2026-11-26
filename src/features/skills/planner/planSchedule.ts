import { db, type CharacterAcceleratorRecord, type SkillPlanRecord } from '@/db';
import {
  computeSkillPlanSchedule,
  type SkillPlanSchedule,
} from '@/engine/skills/skillPlanSchedule';
import { baselineAttributes, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { Attributes, CloneState, Implants, TrainedSkill } from '@/engine/types';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { loadCharacterAttributes } from '@/features/skills/data';
import { loadImplantBonuses } from '@/features/skills/typeDetail';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { projectQueueEnd } from '@/engine/skills/queueStatus';
import {
  loadSkillCatalog,
  toAttributeBaseline,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import {
  SYNCED_CLONE_STATES_KEY,
  cloneStateFor,
  parseCloneStates,
} from '@/features/skills/cloneState';
import { normalizeMarkerAttributes } from './markers';
import { pinnedInProgressEntry } from './queueRows';
import { normalizeWhatIfSelection, whatIfImplants } from './whatIfImplants';
import { isAcceleratorLive } from '@/engine/accelerator';
import { acceleratorId } from '@/features/accelerator/characterAccelerators';
import { acceleratorBoosters } from './planBooster';

export const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

export type SchedulablePlan = Pick<
  SkillPlanRecord,
  'entries' | 'markers' | 'markerAttributes' | 'whatIfImplants'
>;

export interface PlanScheduleInputs {
  catalog: SkillCatalog;
  trained: ReadonlyMap<number, TrainedSkill>;
  queueEntries: readonly SkillQueueEntry[];
  attributes: Attributes;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  cloneState: CloneState;
  accelerator?: CharacterAcceleratorRecord | null;
}

export function schedulePlan(
  plan: SchedulablePlan,
  inputs: PlanScheduleInputs,
  nowMs: number
): SkillPlanSchedule {
  const implants = whatIfImplants(normalizeWhatIfSelection(plan.whatIfImplants), inputs.implants);
  const running = isAcceleratorLive(inputs.accelerator, nowMs) ? inputs.accelerator : null;
  const boosters = acceleratorBoosters(running);
  const queue = projectQueueEnd(inputs.trained, inputs.queueEntries, nowMs, plan.entries);
  const schedule = computeSkillPlanSchedule({
    entries: plan.entries,
    skills: inputs.catalog.engineSkills,
    trainedSkills: queue.trained,
    attributes: inputs.attributes,
    implants,
    boosters,
    markers: plan.markers,
    markerAttributes: normalizeMarkerAttributes(
      plan.markers,
      plan.markerAttributes,
      plan.entries.length
    ),
    cloneState: inputs.cloneState,
    startDate: new Date(queue.startMs),
  });
  const pinned = pinnedInProgressEntry(plan.entries, queue, nowMs);
  if (!pinned) return schedule;
  const { markersResult } = schedule;
  return {
    ...schedule,
    totalSeconds: schedule.totalSeconds + pinned.seconds,
    markersResult: markersResult && {
      ...markersResult,
      totalSeconds: markersResult.totalSeconds + pinned.seconds,
      currentSeconds: markersResult.currentSeconds + pinned.seconds,
    },
  };
}

export function schedulePlanWith(
  plan: SchedulablePlan,
  inputs: PlanScheduleInputs,
  nowMs: number,
  override: Partial<SchedulablePlan> = {}
): SkillPlanSchedule {
  return schedulePlan({ ...plan, ...override }, inputs, nowMs);
}

export async function loadPlanScheduleInputs(
  characterId: number,
  nowMs: number
): Promise<PlanScheduleInputs> {
  const [catalog, corrected, attrs, implants, cloneRecord, accelerator] = await Promise.all([
    loadSkillCatalog(),
    loadCorrectedSkills(characterId, nowMs),
    loadCharacterAttributes(characterId),
    loadImplantBonuses(characterId),
    db.settings.get(SYNCED_CLONE_STATES_KEY),
    db.characterAccelerators.get(acceleratorId(characterId)),
  ]);
  const attributeBaseline = attrs?.data ? toAttributeBaseline(attrs.data, implants) : null;
  return {
    catalog,
    trained: corrected.trained,
    queueEntries: corrected.queueResult?.data ?? [],
    attributes: (attributeBaseline && baselineAttributes(attributeBaseline)) ?? DEFAULT_ATTRIBUTES,
    attributeBaseline,
    implants,
    cloneState: cloneStateFor(parseCloneStates(cloneRecord?.value), characterId),
    accelerator: accelerator ?? null,
  };
}
