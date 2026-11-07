/**
 * A Popular fits row's can-fly verdict (zKillboard or EVE Workbench) for the
 * active Character: "Can fly", or "Missing N skills" with "Omega only" when an Alpha needs a
 * skill past the Alpha cap. Pure, and the same rules the editor's Missing
 * skills chip shows for the fit once opened: `missingSkillEntries` for the
 * count, `exceedsAlphaCap` on an Alpha for the cap.
 */
import { exceedsAlphaCap } from '@/engine/alphaCap';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { CloneState, EngineSkill } from '@/engine/types';
import { missingSkillEntries } from './skillGaps';

export type FitSkillVerdict =
  | { kind: 'canFly' }
  | { kind: 'missing'; count: number; omegaOnly: boolean }
  /** A type it carries couldn't be read, and nothing read so far is missing: never "can fly". */
  | { kind: 'unknown' };

export interface FitSkillVerdictInput {
  /** Every readable type's required skills; a type left out is unknown. */
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>;
  /** The pilot's Effective Skill Levels. */
  skillLevels: ReadonlyMap<number, number>;
  /** For the Alpha cap; a skill left out is never flagged. */
  skills: ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel'>>;
  cloneState: CloneState;
}

/** `typeIds`: the fit's hull, modules, charges, drones and fighters (`fittingRequirementTypeIds`). */
export function fitSkillVerdict(
  typeIds: readonly number[],
  { requirementsByType, skillLevels, skills, cloneState }: FitSkillVerdictInput
): FitSkillVerdict {
  const missing = missingSkillEntries(typeIds, requirementsByType, skillLevels);
  if (missing.length > 0) {
    const omegaOnly =
      cloneState === 'alpha' &&
      missing.some(({ skillTypeID, targetLevel }) => {
        const skill = skills.get(skillTypeID);
        return skill !== undefined && exceedsAlphaCap(skill, targetLevel);
      });
    return { kind: 'missing', count: missing.length, omegaOnly };
  }
  if (typeIds.some((typeId) => !requirementsByType.has(typeId))) return { kind: 'unknown' };
  return { kind: 'canFly' };
}
