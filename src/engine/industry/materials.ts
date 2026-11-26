import type {
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
} from '@/engine/industry/types';
import { ME_MAX } from '@/engine/industry/efficiency';
import { rigBonusPct } from '@/engine/industry/types';
import type { ProductRigScope } from '@/engine/industry/rigScope';

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function assertRuns(runs: number): void {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new RangeError(`runs must be an integer >= 1, got ${runs}`);
  }
}

export function materialModifier(
  me: number,
  ctx: FacilityContext,
  productScope?: ProductRigScope
): number {
  if (!Number.isInteger(me) || me < 0 || me > ME_MAX) {
    throw new RangeError(`ME must be an integer 0..${ME_MAX}, got ${me}`);
  }
  const structurePct = ctx.facility.materialBonusPct;
  const rigPct = ctx.facility.structure
    ? rigBonusPct(ctx.rigFit, 'me', ctx.facility.activity, ctx.security, productScope)
    : 0;
  return (1 - me / 100) * (1 - structurePct / 100) * (1 - rigPct / 100);
}

export function effectiveMaterialQuantity(baseQty: number, runs: number, modifier: number): number {
  assertRuns(runs);
  return Math.max(runs, Math.ceil(round2(runs * baseQty * modifier)));
}

export function effectiveMaterials(
  blueprint: IndustryBlueprint,
  runs: number,
  me: number,
  ctx: FacilityContext
): EffectiveMaterial[] {
  const modifier = materialModifier(me, ctx, blueprint.rigScope);
  return blueprint.materials.map(({ typeID, quantity }) => ({
    typeID,
    baseQuantity: quantity * runs,
    quantity: effectiveMaterialQuantity(quantity, runs, modifier),
  }));
}
