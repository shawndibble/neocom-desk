import type { PilotProfile } from './types';

/**
 * A profile from the active Character: skills at Effective Skill Level
 * (CONTEXT.md) and the implants in the active clone. Copies the skills map
 * so the profile is a snapshot, not a live view onto the caller's data.
 * `boosterTypeIds` is always empty here — see `PilotProfile`'s own doc.
 */
export function buildPilotProfile(
  effectiveSkillLevels: ReadonlyMap<number, number>,
  implantTypeIds: readonly number[]
): PilotProfile {
  return { skillLevels: new Map(effectiveSkillLevels), implantTypeIds, boosterTypeIds: [] };
}

/**
 * The logged-out share view's profile (scope decision
 * `20260924-150509-fittings-section-a-fitter-after-all.md`): every skill at
 * level V, no implants — there is no clone to read one from.
 */
export function buildAllVProfile(allSkillTypeIds: readonly number[]): PilotProfile {
  return {
    skillLevels: allVSkillLevels(allSkillTypeIds),
    implantTypeIds: [],
    boosterTypeIds: [],
  };
}

/** Every skill at level V — the one way "All V" is built, whether a whole profile or a skill override's base. */
export function allVSkillLevels(allSkillTypeIds: readonly number[]): Map<number, number> {
  return new Map(allSkillTypeIds.map((typeId) => [typeId, 5]));
}
