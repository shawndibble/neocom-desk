/**
 * Job duration.
 * duration = baseTime * runs * (1 - TE/100) * skill modifiers * facility modifiers
 * Which skills apply depends on the activity (issue #513; sources cited on
 * `SKILL_IDS` in ./types.ts):
 *   manufacturing: Industry -4%/level, Advanced Industry -3%/level
 *   reaction:      Reactions -4%/level; the two manufacturing skills do not
 *                  apply at all
 * All factors stack multiplicatively. Rig TE bonus scales with security band.
 */
import type { FacilityContext, SkillLevels } from '@/engine/industry/types';
import { RIG_TIME_BONUS_PCT, SKILL_IDS, rigSecurityMultiplierFor } from '@/engine/industry/types';

const INDUSTRY_PCT_PER_LEVEL = 4;
const ADVANCED_INDUSTRY_PCT_PER_LEVEL = 3;
const REACTIONS_PCT_PER_LEVEL = 4;

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
  // Reactions have their own skill line and their own dogma attribute
  // (`reactionTimeBonus`); Industry/Advanced Industry carry manufacturing-only
  // attributes and never touch a reaction job (issue #513). Reactor rigs also
  // scale by security band on a different table than manufacturing rigs
  // (issue #460). Everything else is shared.
  const skillTerms =
    ctx.facility.activity === 'reaction'
      ? [[SKILL_IDS.reactions, REACTIONS_PCT_PER_LEVEL] as const]
      : ([
          [SKILL_IDS.industry, INDUSTRY_PCT_PER_LEVEL],
          [SKILL_IDS.advancedIndustry, ADVANCED_INDUSTRY_PCT_PER_LEVEL],
        ] as const);
  const rigPct = ctx.facility.structure
    ? RIG_TIME_BONUS_PCT[ctx.rig] * rigSecurityMultiplierFor(ctx.facility.activity)[ctx.security]
    : 0;
  let modifier = (1 - te / 100) * (1 - ctx.facility.timeBonusPct / 100) * (1 - rigPct / 100);
  for (const [typeID, pctPerLevel] of skillTerms) {
    modifier *= 1 - (pctPerLevel * skillLevel(skills, typeID)) / 100;
  }
  return modifier;
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
