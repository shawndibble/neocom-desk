/**
 * Job duration.
 * duration = baseTime * runs * (1 - TE/100) * skill modifiers * facility modifiers
 * Skills (EVE University wiki "Manufacturing"):
 *   Industry            -4% manufacturing time per level
 *   Advanced Industry   -3% manufacturing time per level
 * All factors stack multiplicatively. Rig TE bonus scales with security band.
 */

import type { FacilityContext, SkillLevels } from '@/engine/industry/types';
import { RIG_TIME_BONUS_PCT, SKILL_IDS, rigSecurityMultiplierFor } from '@/engine/industry/types';

const INDUSTRY_PCT_PER_LEVEL = 4;
const ADVANCED_INDUSTRY_PCT_PER_LEVEL = 3;

function skillLevel(skills: SkillLevels, typeID: number): number {
  const level = skills[typeID] ?? 0;
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`skill ${typeID} level must be an integer 0..5, got ${level}`);
  }
  return level;
}

/** Combined time multiplier for TE level + skills + facility + rig. */
export function timeModifier(te: number, skills: SkillLevels, ctx: FacilityContext): number {
  if (!Number.isInteger(te) || te < 0 || te > 20) {
    throw new RangeError(`TE must be an integer 0..20, got ${te}`);
  }
  const industry = skillLevel(skills, SKILL_IDS.industry);
  const advanced = skillLevel(skills, SKILL_IDS.advancedIndustry);
  // Reactor rigs scale by security band on a different table than
  // manufacturing rigs (issue #460); every other term applies unchanged —
  // the brief's sourcing covered facility/rig bonuses only, not a skill
  // carve-out, so Industry/Advanced Industry keep applying here as written.
  const rigPct = ctx.facility.structure
    ? RIG_TIME_BONUS_PCT[ctx.rig] * rigSecurityMultiplierFor(ctx.facility.activity)[ctx.security]
    : 0;
  return (
    (1 - te / 100) *
    (1 - (INDUSTRY_PCT_PER_LEVEL * industry) / 100) *
    (1 - (ADVANCED_INDUSTRY_PCT_PER_LEVEL * advanced) / 100) *
    (1 - ctx.facility.timeBonusPct / 100) *
    (1 - rigPct / 100)
  );
}

/** Job duration in seconds for `runs` runs. */
export function jobDurationSeconds(
  baseTimePerRun: number,
  runs: number,
  te: number,
  skills: SkillLevels,
  ctx: FacilityContext
): number {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
  return baseTimePerRun * runs * timeModifier(te, skills, ctx);
}
