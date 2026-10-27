/**
 * Job duration.
 * duration = baseTime * runs * (1 - TE/100) * facility modifiers * Character Modifiers
 * The Character's share (skills + implants, scoped per activity) is
 * `jobTimeMultiplier` in ./characterModifiers. All factors stack
 * multiplicatively. Rig TE bonus scales with security band.
 */
import type { BlueprintSkillRequirement, FacilityContext } from '@/engine/industry/types';
import { rigBonusPct } from '@/engine/industry/types';
import { jobTimeMultiplier, type CharacterModifiers } from '@/engine/industry/characterModifiers';

/** Combined time multiplier for TE level + Character Modifiers + facility + rig. */
export function timeModifier(
  te: number,
  modifiers: CharacterModifiers,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[]
): number {
  if (!Number.isInteger(te) || te < 0 || te > 20) {
    throw new RangeError(`TE must be an integer 0..20, got ${te}`);
  }
  // Reactor rigs scale by security band on a different table than
  // manufacturing rigs (issue #460); `rigBonusPct` picks it by activity.
  const rigPct = ctx.facility.structure
    ? rigBonusPct(ctx.rigFit, 'te', ctx.facility.activity, ctx.security)
    : 0;
  return (
    (1 - te / 100) *
    (1 - ctx.facility.timeBonusPct / 100) *
    (1 - rigPct / 100) *
    jobTimeMultiplier(modifiers, ctx.facility.activity, blueprintSkills)
  );
}

/** Job duration in seconds for `runs` runs. */
export function jobDurationSeconds(
  baseTimePerRun: number,
  runs: number,
  te: number,
  modifiers: CharacterModifiers,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[]
): number {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
  return baseTimePerRun * runs * timeModifier(te, modifiers, ctx, blueprintSkills);
}
