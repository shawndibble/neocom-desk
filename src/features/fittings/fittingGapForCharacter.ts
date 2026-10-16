import type { Fitting } from '@/engine/fittings/types';
import { characterFlyGap, type CharacterFlyGap } from '@/engine/fittings/characterFlyGap';
import { computeSkillGaps, fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadPlanScheduleInputs } from '@/features/skills/planner/planSchedule';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { loadRequirementsForTypes } from './skillRequirements';

export type FittingGap = CharacterFlyGap & { names: ReadonlyMap<number, string> };

/**
 * `unloaded`: the Character's /skills read failed. `unconfirmed`: they miss
 * nothing known, but some of the Fitting's requirements couldn't be looked up.
 */
export type FittingGapAnswer =
  { state: 'ready'; gap: FittingGap } | { state: 'unconfirmed' } | { state: 'unloaded' };

const gapCache = new WeakMap<Fitting, Map<number, FittingGapAnswer>>();

async function computeGap(fitting: Fitting, characterId: number): Promise<FittingGapAnswer> {
  const now = Date.now();
  // Both loads read ESI's cache, so the skills are fetched once.
  const [corrected, requirements, inputs] = await Promise.all([
    loadCorrectedSkills(characterId, now),
    loadRequirementsForTypes(fittingRequirementTypeIds(fitting)),
    loadPlanScheduleInputs(characterId, now),
  ]);
  // An empty skill map would read as "missing everything".
  if (corrected.skillsResult == null) return { state: 'unloaded' };
  const { missing } = computeSkillGaps(fitting, requirements.byType, corrected.effective);
  if (missing.length === 0 && requirements.unknownTypeIds.length > 0) {
    return { state: 'unconfirmed' };
  }
  const { catalog } = inputs;
  const scheduled =
    missing.length === 0
      ? []
      : scheduleEntries(missing, {
          skills: catalog.engineSkills,
          trainedSkills: inputs.trained,
          attributes: inputs.attributes,
          implants: inputs.implants,
          cloneState: inputs.cloneState,
        });
  const gap = characterFlyGap(missing, scheduled);
  const names = new Map(
    gap.skills.map(({ skillTypeID }) => [
      skillTypeID,
      catalog.engineSkills.get(skillTypeID)?.name ?? `#${skillTypeID}`,
    ])
  );
  return { state: 'ready', gap: { ...gap, names } };
}

/**
 * The Character's own missing skills for the Fitting and the time to train
 * them, scheduled like "What to train". Only `ready` answers are cached, so
 * an unreadable one retries on the next call.
 */
export async function fittingGapForCharacter(
  fitting: Fitting,
  characterId: number
): Promise<FittingGapAnswer> {
  const perFitting = gapCache.get(fitting) ?? new Map<number, FittingGapAnswer>();
  gapCache.set(fitting, perFitting);
  const cached = perFitting.get(characterId);
  if (cached) return cached;
  const answer = await computeGap(fitting, characterId);
  if (answer.state === 'ready') perFitting.set(characterId, answer);
  return answer;
}

/** The cached answer, if this Fitting + Character was already worked out; never starts a load. */
export function cachedFittingGap(fitting: Fitting, characterId: number): FittingGapAnswer | null {
  return gapCache.get(fitting)?.get(characterId) ?? null;
}
