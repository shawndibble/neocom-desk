import { loadSkills } from '@/sde/loadSde';
import type { SkillType } from '@/sde/types';
import type { CharacterAttributes, CharacterSkill } from '@/esi/endpoints';
import { buildUnlockIndex } from '@/engine/skills/skillUnlocks';
import { deriveAttributeBaseline, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { Attributes, EngineSkill, Implants, SkillUnlock, TrainedSkill } from '@/engine/types';
import type { SkillLevels } from '@/engine/industry/types';

export interface SkillCatalog {
  engineSkills: Map<number, EngineSkill>;
  bySkillTypeID: Map<number, SkillType>;
  unlocksByTypeID: Map<number, SkillUnlock[]>;
}

function toEngineSkill(skill: SkillType): EngineSkill {
  return {
    typeID: skill.typeID,
    name: skill.name,
    rank: skill.rank,
    primary: skill.primaryAttr,
    secondary: skill.secondaryAttr,
    prereqs: skill.prereqs.map((p) => ({ typeID: p.skillTypeID, level: p.level })),
    alphaMaxLevel: skill.alphaMaxLevel,
  };
}

export async function loadSkillCatalog(): Promise<SkillCatalog> {
  const skills = await loadSkills();
  const engineSkills = new Map<number, EngineSkill>();
  const bySkillTypeID = new Map<number, SkillType>();
  for (const skill of skills) {
    engineSkills.set(skill.typeID, toEngineSkill(skill));
    bySkillTypeID.set(skill.typeID, skill);
  }
  return { engineSkills, bySkillTypeID, unlocksByTypeID: buildUnlockIndex(engineSkills) };
}

export function toTrainedSkillsMap(skills: readonly CharacterSkill[]): Map<number, TrainedSkill> {
  const map = new Map<number, TrainedSkill>();
  for (const skill of skills) {
    map.set(skill.skill_id, { level: skill.trained_skill_level, sp: skill.skillpoints_in_skill });
  }
  return map;
}

export function toAccountSkillLevels(skills: readonly CharacterSkill[]): SkillLevels {
  const levels: SkillLevels = {};
  for (const skill of skills) levels[skill.skill_id] = skill.active_skill_level;
  return levels;
}

export function toAttributeBaseline(
  attrs: CharacterAttributes,
  implants: Implants = {}
): AttributeBaseline {
  const base = (name: keyof Attributes): number => attrs[name] - (implants[name] ?? 0);
  return deriveAttributeBaseline({
    intelligence: base('intelligence'),
    memory: base('memory'),
    perception: base('perception'),
    willpower: base('willpower'),
    charisma: base('charisma'),
  });
}
