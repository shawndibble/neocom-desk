/**
 * A Popular fits row's can-fly verdict (#6011). Same rules as the editor's
 * Missing skills chip, so a row never disagrees with the fit once opened.
 */
import { exceedsAlphaCap } from '@/engine/alphaCap';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { CloneState, EngineSkill, PlanEntry } from '@/engine/types';
import { missingSkillEntries, unusableTypeIds } from './skillGaps';

export type FitSkillVerdict =
  | { kind: 'canFly' }
  | {
      kind: 'missing';
      /** Each skill to train, once, at its highest required level; by name. */
      skills: readonly MissingSkill[];
      /** The fit's types the pilot can't use yet: the row tints their icons. */
      unusableTypeIds: ReadonlySet<number>;
      omegaOnly: boolean;
    }
  /** A type it carries couldn't be read, and nothing read so far is missing: never "can fly". */
  | { kind: 'unknown' };

/** A skill to train; `name` is absent when the catalog doesn't list it. */
export interface MissingSkill extends PlanEntry {
  name: string | undefined;
}

export interface FitSkillVerdictInput {
  /** Every readable type's required skills; a type left out is unknown. */
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>;
  /** The pilot's Effective Skill Levels. */
  skillLevels: ReadonlyMap<number, number>;
  /** For names and the Alpha cap; a skill left out is never flagged. */
  skills: ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel' | 'name'>>;
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
    const named = missing
      .map((entry) => ({ ...entry, name: skills.get(entry.skillTypeID)?.name }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.skillTypeID - b.skillTypeID);
    return {
      kind: 'missing',
      skills: named,
      unusableTypeIds: unusableTypeIds(typeIds, requirementsByType, skillLevels),
      omegaOnly,
    };
  }
  if (typeIds.some((typeId) => !requirementsByType.has(typeId))) return { kind: 'unknown' };
  return { kind: 'canFly' };
}
