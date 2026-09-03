/**
 * Adapts SDE skill data (src/sde) to the shapes src/engine expects. Not
 * memoized: callers hold the result in component state, and memoizing here
 * would leak one test's fixture into the next.
 */
import { loadSkills } from '@/sde/loadSde';
import type { SkillType } from '@/sde/types';
import type { CharacterAttributes, CharacterSkill } from '@/esi/endpoints';
import { buildUnlockIndex } from '@/engine/skillUnlocks';
import { deriveAttributeBaseline, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { Attributes, EngineSkill, Implants, SkillUnlock, TrainedSkill } from '@/engine/types';

export interface SkillCatalog {
  /** All skills, keyed by typeID, in the shape src/engine consumes. */
  engineSkills: Map<number, EngineSkill>;
  /** Raw SDE rows, keyed by typeID (name/groupName for display). */
  bySkillTypeID: Map<number, SkillType>;
  /** Reverse of prereqs: for a skill, every skill it unlocks and the level needed. Built once. */
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

/** ESI trained-skills rows -> engine TrainedSkill map, keyed by typeID. */
export function toTrainedSkillsMap(skills: readonly CharacterSkill[]): Map<number, TrainedSkill> {
  const map = new Map<number, TrainedSkill>();
  for (const skill of skills) {
    map.set(skill.skill_id, { level: skill.trained_skill_level, sp: skill.skillpoints_in_skill });
  }
  return map;
}

/**
 * ESI character attributes -> the engine's base sheet (drops remap-metadata
 * fields), classified by `deriveAttributeBaseline`.
 *
 * ESI's /characters/{id}/attributes reports *effective* values, but the engine
 * expects base + remap only — computeSchedule and the optimizer add implants
 * themselves. Pass the character's implant bonuses to subtract them back out;
 * otherwise they'd count twice, inflating the baseline past anything a remap
 * can reach (UX-REVIEW #2's "Savings: 0m" contradiction).
 *
 * That subtraction is not the whole story: an in-game cerebral accelerator is
 * baked into the same values, and ESI exposes no endpoint that would say so.
 * What is left after implants therefore still has to be checked against EVE's
 * legal space, which is what `deriveAttributeBaseline` does — recovering a
 * uniform accelerator when one explains the excess, and reporting the sheet as
 * `impossible` when nothing does. The old `Math.max(17, ...)` floor clamp went
 * with it: flooring an over-subtracted attribute turned a misread into a
 * plausible-looking sheet, which is the failure mode this replaces.
 */
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
