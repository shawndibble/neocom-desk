import type { SkillType } from '@/sde/types';

export const PRODUCTION_SKILL_GROUP_ID = 268;
export const SCIENCE_SKILL_GROUP_ID = 270;

export interface AlphaIndustrySkill {
  typeID: number;
  name: string;
  level: number;
}

export function alphaIndustrySkills(
  skills: readonly Pick<SkillType, 'typeID' | 'name' | 'groupID' | 'alphaMaxLevel'>[]
): AlphaIndustrySkill[] {
  return skills
    .filter(
      (s) =>
        (s.groupID === PRODUCTION_SKILL_GROUP_ID || s.groupID === SCIENCE_SKILL_GROUP_ID) &&
        (s.alphaMaxLevel ?? 0) > 0
    )
    .map((s) => ({ typeID: s.typeID, name: s.name, level: s.alphaMaxLevel! }))
    .sort((a, b) => a.typeID - b.typeID);
}
