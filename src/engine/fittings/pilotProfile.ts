import type { PilotProfile } from './types';

export function buildPilotProfile(
  effectiveSkillLevels: ReadonlyMap<number, number>,
  implantTypeIds: readonly number[]
): PilotProfile {
  return { skillLevels: new Map(effectiveSkillLevels), implantTypeIds, boosterTypeIds: [] };
}

export function buildAllVProfile(allSkillTypeIds: readonly number[]): PilotProfile {
  return {
    skillLevels: allVSkillLevels(allSkillTypeIds),
    implantTypeIds: [],
    boosterTypeIds: [],
  };
}

export function allVSkillLevels(allSkillTypeIds: readonly number[]): Map<number, number> {
  return new Map(allSkillTypeIds.map((typeId) => [typeId, 5]));
}
