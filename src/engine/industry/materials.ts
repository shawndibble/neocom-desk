/**
 * Effective material quantities.
 * required = max(runs, ceil(round(runs * baseQuantity * materialModifier, 2)))
 * materialModifier = (1 - ME/100) * (1 - structure%/100) * (1 - rig%*secMult/100)
 * Rounding is per job, not per run; the round-to-2-decimals happens before ceil.
 * Sources: EVE University wiki "Manufacturing" (per-job rounding), EVE Online
 * forums / eve-industry.org "Formulas for EVE Industry" (exact expression).
 */

import type {
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
} from '@/engine/industry/types';
import {
  REACTION_RIG_SECURITY_MULTIPLIER,
  RIG_MATERIAL_BONUS_PCT,
  RIG_SECURITY_MULTIPLIER,
} from '@/engine/industry/types';

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function assertRuns(runs: number): void {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
}

/** Combined material multiplier for ME level + facility + rig. */
export function materialModifier(me: number, ctx: FacilityContext): number {
  if (!Number.isInteger(me) || me < 0 || me > 10) {
    throw new RangeError(`ME must be an integer 0..10, got ${me}`);
  }
  const structurePct = ctx.facility.materialBonusPct;
  // Rigs only work on player structures. Reactor rigs scale by security band
  // on a different table than manufacturing rigs (issue #460).
  const securityMultiplier =
    ctx.facility.activity === 'reaction'
      ? REACTION_RIG_SECURITY_MULTIPLIER
      : RIG_SECURITY_MULTIPLIER;
  const rigPct = ctx.facility.structure
    ? RIG_MATERIAL_BONUS_PCT[ctx.rig] * securityMultiplier[ctx.security]
    : 0;
  return (1 - me / 100) * (1 - structurePct / 100) * (1 - rigPct / 100);
}

/** Units of one material consumed by a whole job. */
export function effectiveMaterialQuantity(baseQty: number, runs: number, modifier: number): number {
  assertRuns(runs);
  return Math.max(runs, Math.ceil(round2(runs * baseQty * modifier)));
}

/** Per-job effective quantities for every blueprint material. */
export function effectiveMaterials(
  blueprint: IndustryBlueprint,
  runs: number,
  me: number,
  ctx: FacilityContext
): EffectiveMaterial[] {
  const modifier = materialModifier(me, ctx);
  return blueprint.materials.map(({ typeID, quantity }) => ({
    typeID,
    baseQuantity: quantity * runs,
    quantity: effectiveMaterialQuantity(quantity, runs, modifier),
  }));
}
