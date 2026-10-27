/**
 * Whether an Alpha clone can fly a Fitting, going by skill caps alone: every
 * skill the hull, modules, charges and drones need — and every prerequisite
 * beneath those — at a level an Alpha can train (`alphaMaxLevel`, absent when
 * it can't train the skill at all). The same test EVE Workbench's "Alpha
 * Suitable" makes; it knows nothing of the few non-skill Alpha limits.
 */
import { exceedsAlphaCap } from '@/engine/alphaCap';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { EngineSkill } from '@/engine/types';

export interface AlphaBlocker extends RequiredSkill {
  /** The highest level an Alpha can train it to; 0 when not at all. */
  alphaMaxLevel: number;
}

/** The skill levels keeping an Alpha out of the Fitting; empty when it can fly it. */
export function fittingAlphaBlockers(
  required: readonly RequiredSkill[],
  skills: ReadonlyMap<number, EngineSkill>
): AlphaBlocker[] {
  // The highest level each skill is needed at, prerequisites included, in first-seen order.
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
