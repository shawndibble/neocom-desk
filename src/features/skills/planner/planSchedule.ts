/**
 * The one place a Skill Plan is costed.
 *
 * The plan editor and the Calendar both quote "when does this step land", and
 * they must agree to the minute — so the input assembly (What-If Implants, the
 * Booster and its detected-accelerator prefill, Remap Markers, the queue-end
 * start, Clone State) lives here rather than inline in either. `schedulePlan`
 * is pure; `loadPlanScheduleInputs` is the fetch side for callers with no
 * hook to lean on.
 */
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
import { composePlanBoosters, toBoosters } from './planBooster';

/** What the scheduler costs against when ESI's attribute sheet cannot be read or explained. */
export const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

/** The persisted fields of a plan that change its schedule. */
export type SchedulablePlan = Pick<
  SkillPlanRecord,
  'entries' | 'markers' | 'markerAttributes' | 'whatIfImplants' | 'booster' | 'boosters'
>;

export interface PlanScheduleInputs {
  catalog: SkillCatalog;
  /** Trained skills as of the load — before the live queue is applied. */
  trained: ReadonlyMap<number, TrainedSkill>;
  /** The live in-game queue: the plan starts where it ends. */
  queueEntries: readonly SkillQueueEntry[];
  /** Base attributes (implant bonuses removed). */
  attributes: Attributes;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  cloneState: CloneState;
  /** The Character's typed-in accelerator, shared by every plan (`features/accelerator`). */
  accelerator?: CharacterAcceleratorRecord | null;
}

/** The plan's schedule, started when the live queue's lead ends (`nowMs` if there is none). */
export function schedulePlan(
  plan: SchedulablePlan,
  inputs: PlanScheduleInputs,
  nowMs: number
): SkillPlanSchedule {
  const implants = whatIfImplants(normalizeWhatIfSelection(plan.whatIfImplants), inputs.implants);
  const detectedAccelerator =
    inputs.attributeBaseline?.kind === 'accelerated'
      ? inputs.attributeBaseline.acceleratorBonus
      : null;
  const running = isAcceleratorLive(inputs.accelerator, nowMs) ? inputs.accelerator : null;
  const boosters = toBoosters(
    composePlanBoosters(plan.boosters, plan.booster, running, detectedAccelerator)
  );
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
  // The level training right now, when the plan also lists it, is the plan's
  // own time: the queue pins it as lead (so the steps start after it), but a
  // plan copied from the queue must still total what the game shows. The
  // finish date already includes the lead; only the total needs it.
  const pinned = pinnedInProgressEntry(plan.entries, queue, nowMs);
  return pinned ? { ...schedule, totalSeconds: schedule.totalSeconds + pinned.seconds } : schedule;
}

/**
 * `schedulePlan` for a variant of `plan`: `override` replaces only the named
 * plan fields (candidate entries/markers, a forced What-If lens), so callers
 * costing a hypothetical share one inputs object and cannot drift from it.
 */
export function schedulePlanWith(
  plan: SchedulablePlan,
  inputs: PlanScheduleInputs,
  nowMs: number,
  override: Partial<SchedulablePlan> = {}
): SkillPlanSchedule {
  return schedulePlan({ ...plan, ...override }, inputs, nowMs);
}

/** Everything `schedulePlan` needs for one Character, read from ESI's cache and Dexie. */
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
