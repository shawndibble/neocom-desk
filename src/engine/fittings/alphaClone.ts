import { exceedsAlphaCap } from '@/engine/alphaCap';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { EngineSkill } from '@/engine/types';

export interface AlphaBlocker extends RequiredSkill {
  alphaMaxLevel: number;
}

export function fittingAlphaBlockers(
  required: readonly RequiredSkill[],
  skills: ReadonlyMap<number, EngineSkill>
): AlphaBlocker[] {
  const needed = new Map<number, number>();
  const visit = (skillTypeID: number, level: number) => {
    if ((needed.get(skillTypeID) ?? 0) >= level) return;
    needed.set(skillTypeID, level);
    for (const prereq of skills.get(skillTypeID)?.prereqs ?? []) {
      visit(prereq.typeID, prereq.level);
    }
  };
  for (const skill of required) visit(skill.skillTypeID, skill.level);

  const blockers: AlphaBlocker[] = [];
  for (const [skillTypeID, level] of needed) {
    const skill = skills.get(skillTypeID);
    if (skill && exceedsAlphaCap(skill, level)) {
      blockers.push({ skillTypeID, level, alphaMaxLevel: skill.alphaMaxLevel ?? 0 });
    }
  }
  return blockers;
}
