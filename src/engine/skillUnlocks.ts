import type { EngineSkill, SkillUnlock } from './types';

/**
 * Reverse index of EngineSkill.prereqs: for a prerequisite skill, every skill
 * it unlocks and the level of the prerequisite each requires. Built once from
 * the full catalog — callers must not recompute this per render.
 */
export function buildUnlockIndex(
  skills: ReadonlyMap<number, EngineSkill>
): Map<number, SkillUnlock[]> {
  const index = new Map<number, SkillUnlock[]>();
  for (const skill of skills.values()) {
    for (const prereq of skill.prereqs) {
      const unlocks = index.get(prereq.typeID);
      const entry = { typeID: skill.typeID, level: prereq.level };
      if (unlocks) unlocks.push(entry);
      else index.set(prereq.typeID, [entry]);
    }
  }
  return index;
}
