/**
 * "What if my skills were…": a Fitting's stats under the pilot's skills with
 * some overridden — all untrained (All 0), all at V (All V), or single skills
 * set to a level on top of either those or the Character's own. Implants and
 * boosters are the pilot's as ever. Pure.
 */
import { allVSkillLevels } from './pilotProfile';
import type { PilotProfile } from './types';

export type SkillBase = 'character' | 'all0' | 'allV';

export interface SkillOverrides {
  base: SkillBase;
  /** Skill type id → level 0-5, set on top of the base. */
  levels: Readonly<Record<number, number>>;
}

export const NO_SKILL_OVERRIDES: SkillOverrides = { base: 'character', levels: {} };

export function hasSkillOverrides(overrides: SkillOverrides): boolean {
  return overrides.base !== 'character' || Object.keys(overrides.levels).length > 0;
}

function clampLevel(level: number): number {
  return Math.min(5, Math.max(0, Math.round(level)));
}

/**
 * The pilot with `overrides` applied — the same object when there are none,
 * so a caller memoizing on the profile (the fit checks' cache) keeps its hits.
 */
export function applySkillOverrides(
  profile: PilotProfile,
  overrides: SkillOverrides,
  allSkillTypeIds: readonly number[]
): PilotProfile {
  if (!hasSkillOverrides(overrides)) return profile;
  const skillLevels =
    overrides.base === 'character'
      ? new Map(profile.skillLevels)
      : overrides.base === 'allV'
        ? allVSkillLevels(allSkillTypeIds)
        : new Map<number, number>();
  for (const [typeId, level] of Object.entries(overrides.levels)) {
    const clamped = clampLevel(level);
    if (clamped === 0) skillLevels.delete(Number(typeId));
    else skillLevels.set(Number(typeId), clamped);
  }
  return { ...profile, skillLevels };
}

/** `overrides` with one skill set to `level`, or cleared back to the base with `null`. */
export function withSkillLevel(
  overrides: SkillOverrides,
  skillTypeId: number,
  level: number | null
): SkillOverrides {
  const levels = { ...overrides.levels };
  if (level === null) delete levels[skillTypeId];
  else levels[skillTypeId] = clampLevel(level);
  return { ...overrides, levels };
}
