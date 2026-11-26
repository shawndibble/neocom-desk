import type { EngineSkill, SkillUnlock } from '../types';

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
