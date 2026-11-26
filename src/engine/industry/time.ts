import type { BlueprintSkillRequirement, FacilityContext } from '@/engine/industry/types';
import { rigBonusPct } from '@/engine/industry/types';
import type { ProductRigScope } from '@/engine/industry/rigScope';
import { jobTimeMultiplier, type CharacterModifiers } from '@/engine/industry/characterModifiers';

export function timeModifier(
  te: number,
  modifiers: CharacterModifiers,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[],
  productScope?: ProductRigScope
): number {
  if (!Number.isInteger(te) || te < 0 || te > 20) {
    throw new RangeError(`TE must be an integer 0..20, got ${te}`);
  }
  const rigPct = ctx.facility.structure
    ? rigBonusPct(ctx.rigFit, 'te', ctx.facility.activity, ctx.security, productScope)
    : 0;
  return (
    (1 - te / 100) *
    (1 - ctx.facility.timeBonusPct / 100) *
    (1 - rigPct / 100) *
    jobTimeMultiplier(modifiers, ctx.facility.activity, blueprintSkills)
  );
}

export function jobDurationSeconds(
  baseTimePerRun: number,
  runs: number,
  te: number,
  modifiers: CharacterModifiers,
  ctx: FacilityContext,
  blueprintSkills?: readonly BlueprintSkillRequirement[],
  productScope?: ProductRigScope
): number {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
  return baseTimePerRun * runs * timeModifier(te, modifiers, ctx, blueprintSkills, productScope);
}
