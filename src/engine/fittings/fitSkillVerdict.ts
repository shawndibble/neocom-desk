import { exceedsAlphaCap } from '@/engine/alphaCap';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { CloneState, EngineSkill, PlanEntry } from '@/engine/types';
import { missingSkillEntries, unusableTypeIds } from './skillGaps';

export type FitSkillVerdict =
  | { kind: 'canFly' }
  | {
      kind: 'missing';
      skills: readonly MissingSkill[];
      unusableTypeIds: ReadonlySet<number>;
      omegaOnly: boolean;
    }
  | { kind: 'unknown' };

export interface MissingSkill extends PlanEntry {
  name: string | undefined;
}

export interface FitSkillVerdictInput {
  requirementsByType: ReadonlyMap<number, readonly RequiredSkill[]>;
  skillLevels: ReadonlyMap<number, number>;
  skills: ReadonlyMap<number, Pick<EngineSkill, 'alphaMaxLevel' | 'name'>>;
  cloneState: CloneState;
}

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
