import type { SkillType } from '@/sde/types';

/** SDE skill groups a manufacturing beginner trains first. */
const PRODUCTION_GROUP = 268;
const SCIENCE_GROUP = 270;

export interface AlphaIndustrySkill {
  typeID: number;
  name: string;
  /** Highest level an Alpha clone can train it to. */
  level: number;
}

/**
 * The Production and Science skills an Alpha clone can train, each with its
 * Alpha cap, in typeID order. Read from the SDE, so the "New to Industry?"
 * explainer can never claim more (or less) than the game allows.
 */
export function alphaIndustrySkills(
  skills: readonly Pick<SkillType, 'typeID' | 'name' | 'groupID' | 'alphaMaxLevel'>[]
): AlphaIndustrySkill[] {
  return skills
    .filter(
      (s) =>
        (s.groupID === PRODUCTION_GROUP || s.groupID === SCIENCE_GROUP) &&
        (s.alphaMaxLevel ?? 0) > 0
    )
    .map((s) => ({ typeID: s.typeID, name: s.name, level: s.alphaMaxLevel! }))
    .sort((a, b) => a.typeID - b.typeID);
}
