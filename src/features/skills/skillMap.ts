/**
 * Adapts SDE skill data (src/sde) to the shapes src/engine expects. Not
 * memoized: callers hold the result in component state, and memoizing here
 * would leak one test's fixture into the next.
 */
import { loadSkills } from '@/sde/loadSde';
import type { SkillType } from '@/sde/types';
import type { CharacterAttributes, CharacterSkill } from '@/esi/endpoints';
import type { Attributes, EngineSkill, TrainedSkill } from '@/engine/types';

export interface SkillCatalog {
  /** All skills, keyed by typeID, in the shape src/engine consumes. */
  engineSkills: Map<number, EngineSkill>;
  /** Raw SDE rows, keyed by typeID (name/groupName for display). */
  bySkillTypeID: Map<number, SkillType>;
}

function toEngineSkill(skill: SkillType): EngineSkill {
  return {
    typeID: skill.typeID,
    name: skill.name,
    rank: skill.rank,
    primary: skill.primaryAttr,
    secondary: skill.secondaryAttr,
    prereqs: skill.prereqs.map((p) => ({ typeID: p.skillTypeID, level: p.level })),
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
  return { engineSkills, bySkillTypeID };
}

/** ESI trained-skills rows -> engine TrainedSkill map, keyed by typeID. */
export function toTrainedSkillsMap(skills: readonly CharacterSkill[]): Map<number, TrainedSkill> {
  const map = new Map<number, TrainedSkill>();
  for (const skill of skills) {
    map.set(skill.skill_id, { level: skill.trained_skill_level, sp: skill.skillpoints_in_skill });
  }
  return map;
}

/** ESI character attributes -> engine Attributes (drops remap-metadata fields). */
export function toEngineAttributes(attrs: CharacterAttributes): Attributes {
  return {
    intelligence: attrs.intelligence,
    memory: attrs.memory,
    perception: attrs.perception,
    willpower: attrs.willpower,
    charisma: attrs.charisma,
  };
}
