/**
 * Job duration.
 * duration = baseTime * runs * (1 - TE/100) * skill modifiers * facility modifiers
 * Which skills apply depends on the activity (issue #513; sources cited on
 * `SKILL_IDS` in ./types.ts):
 *   manufacturing: Industry -4%/level, Advanced Industry -3%/level, plus
 *                  1-2%/level per blueprint-required science/engineering
 *                  skill that carries the bonus (issue #1228)
 *   reaction:      Reactions -4%/level; the two manufacturing skills and the
 *                  science-skill table do not apply at all
 * All factors stack multiplicatively. Rig TE bonus scales with security band.
 */
import type {
  BlueprintSkillRequirement,
  FacilityContext,
  SkillLevels,
} from '@/engine/industry/types';
import {
  MANUFACTURING_TIME_SCIENCE_SKILL_PCT,
  SKILL_IDS,
  rigBonusPct,
} from '@/engine/industry/types';

const INDUSTRY_PCT_PER_LEVEL = 4;
const ADVANCED_INDUSTRY_PCT_PER_LEVEL = 3;
const REACTIONS_PCT_PER_LEVEL = 4;

/**
 * Zainou 'Beancounter' Industry BX-80x implant type IDs -> the % bonus their
 * own ESI/SDE description gives to manufacturing job time (issue #1229).
 * Manufacturing only — reactions have their own skill line and no dogma
 * attribute on this implant touches them. Same one-fitted-at-a-time slot as
 * the RX-80x refining line (`reprocessing.ts`'s `REFINING_IMPLANT_TYPE_IDS`),
 * so a flat lookup is simpler than a general dogma-attribute read here too.
 */
export const MANUFACTURING_TIME_IMPLANT_TYPE_IDS: Readonly<Record<number, number>> = {
  27170: 1, // BX-801
  27167: 2, // BX-802
  27171: 4, // BX-804
};

/**
 * The active clone's manufacturing-time implant bonus, or 0 with none
 * fitted. Takes the character's full implant typeID list (as already read
 * for skill training) rather than a single value, so the caller need not
 * know which slot the implant lives in.
 */
export function resolveManufacturingTimeImplantBonusPct(implantTypeIds: readonly number[]): number {
  let best = 0;
  for (const typeId of implantTypeIds) {
    const pct = MANUFACTURING_TIME_IMPLANT_TYPE_IDS[typeId];
    if (pct !== undefined && pct > best) best = pct;
  }
  return best;
}

function skillLevel(skills: SkillLevels, typeID: number): number {
  const level = skills[typeID] ?? 0;
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`skill ${typeID} level must be an integer 0..5, got ${level}`);
  }
  return level;
}

/** Combined time multiplier for TE level + skills + facility + rig. */
export function timeModifier(
  te: number,
  skills: SkillLevels,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[],
  implantBonusPct = 0
): number {
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
          // Per-blueprint science/engineering skills (issue #1228): filtered
          // to the ones that actually carry the bonus, since a blueprint's
          // own `skills` list also names Industry/Advanced Industry, which
          // are already applied above and must not be double counted. This
          // branch is manufacturing-only already, via the outer ternary.
          ...(blueprintSkills ?? [])
            .filter((req) => req.typeID in MANUFACTURING_TIME_SCIENCE_SKILL_PCT)
            .map((req) => [req.typeID, MANUFACTURING_TIME_SCIENCE_SKILL_PCT[req.typeID]] as const),
        ] as const);
  const rigPct = ctx.facility.structure
    ? rigBonusPct(ctx.rigFit, 'te', ctx.facility.activity, ctx.security)
    : 0;
  let modifier = (1 - te / 100) * (1 - ctx.facility.timeBonusPct / 100) * (1 - rigPct / 100);
  for (const [typeID, pctPerLevel] of skillTerms) {
    modifier *= 1 - (pctPerLevel * skillLevel(skills, typeID)) / 100;
  }
  // BX-80x implants (issue #1229) reduce manufacturing time only, same
  // reaction-branch guard as the science-skill table above.
  if (ctx.facility.activity !== 'reaction') {
    modifier *= 1 - implantBonusPct / 100;
  }
  return modifier;
}

/** Job duration in seconds for `runs` runs. */
export function jobDurationSeconds(
  baseTimePerRun: number,
  runs: number,
  te: number,
  skills: SkillLevels,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[],
  implantBonusPct = 0
): number {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
  return baseTimePerRun * runs * timeModifier(te, skills, ctx, blueprintSkills, implantBonusPct);
}
