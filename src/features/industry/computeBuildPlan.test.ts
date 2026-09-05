import { describe, it, expect } from 'vitest';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { computeBuildPlan } from './computeBuildPlan';

const BLUEPRINT: IndustryBlueprint = {
  name: 'Rifter Blueprint',
  time: 1200,
  materials: [{ typeID: 34, quantity: 4500 }],
  products: [{ typeID: 587, quantity: 1 }],
};

const BASE_PLAN: Pick<
  BuildPlanRecord,
  | 'runs'
  | 'me'
  | 'te'
  | 'facility'
  | 'rigLevel'
  | 'security'
  | 'facilityTaxPct'
  | 'materialSourcing'
> = {
  runs: 10,
  me: 5,
  te: 10,
  facility: 'npcStation',
  rigLevel: 'none',
  security: 'highsec',
};

const MARKET = {
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 4.2 },
  hubPrices: { 34: 5.5, 587: 2_000_000 },
  skills: {},
};

describe('computeBuildPlan', () => {
  it('produces the same result as calling buildVsBuy directly with equivalent inputs', () => {
    const { result, error } = computeBuildPlan({
      plan: BASE_PLAN,
      blueprint: BLUEPRINT,
      ...MARKET,
    });

    const expected = buildVsBuy({
      blueprint: BLUEPRINT,
      runs: 10,
      me: 5,
      te: 10,
      facility: FACILITY_PRESETS.npcStation,
      rig: 'none',
      security: 'highsec',
      facilityTaxPct: undefined,
      ...MARKET,
    });

    expect(error).toBeNull();
    expect(result).toEqual(expected);
  });

  it("passes the plan's material sourcing through to the engine", () => {
    const { result, error } = computeBuildPlan({
      plan: { ...BASE_PLAN, materialSourcing: { 34: { ownedQuantity: 20_000, overridePrice: 4 } } },
      blueprint: BLUEPRINT,
      ...MARKET,
    });
    expect(error).toBeNull();
    const tritanium = result?.materials[0];
    expect(tritanium?.ownedQuantity).toBe(20_000);
    expect(tritanium?.unitPrice).toBe(4);
    expect(result?.materialCost).toBeCloseTo((tritanium!.quantity - 20_000) * 4, 6);
  });

  it('clamps a cleared/invalid runs field to 1 instead of throwing', () => {
    const { result, error } = computeBuildPlan({
      plan: { ...BASE_PLAN, runs: 0 },
      blueprint: BLUEPRINT,
      ...MARKET,
    });
    expect(error).toBeNull();
    expect(result?.materials[0].baseQuantity).toBe(4500); // 1 run x 4500
  });

  it('clamps ME/TE outside the engine ranges instead of throwing', () => {
    const { result, error } = computeBuildPlan({
      plan: { ...BASE_PLAN, me: 99, te: -5 },
      blueprint: BLUEPRINT,
      ...MARKET,
    });
    expect(error).toBeNull();
    expect(result).not.toBeNull();
  });

  it('drops facilityTaxPct for an NPC station even when the plan has one set (fixed 0.25% tax)', () => {
    const { result } = computeBuildPlan({
      plan: { ...BASE_PLAN, facilityTaxPct: 5 },
      blueprint: BLUEPRINT,
      ...MARKET,
    });
    const withoutTax = computeBuildPlan({
      plan: BASE_PLAN,
      blueprint: BLUEPRINT,
      ...MARKET,
    }).result;
    expect(result?.jobFee.facilityTax).toBe(withoutTax?.jobFee.facilityTax);
  });

  it('keeps facilityTaxPct for a player structure', () => {
    const { result } = computeBuildPlan({
      plan: { ...BASE_PLAN, facility: 'raitaru', facilityTaxPct: 2 },
      blueprint: BLUEPRINT,
      ...MARKET,
    });
    // eiv x 2% > eiv x 0 (structure defaultTaxPct is 0)
    expect(result?.jobFee.facilityTax).toBeGreaterThan(0);
  });

  it('forces ME/TE to 0 for a reaction blueprint regardless of the stored plan value (issue #460: reaction formulas are always unresearched)', () => {
    const reactionBlueprint: IndustryBlueprint = { ...BLUEPRINT, activity: 'reaction' };
    const { result } = computeBuildPlan({
      plan: { ...BASE_PLAN, facility: 'athanor', me: 10, te: 20 },
      blueprint: reactionBlueprint,
      ...MARKET,
    });
    const zeroed = computeBuildPlan({
      plan: { ...BASE_PLAN, facility: 'athanor', me: 0, te: 0 },
      blueprint: reactionBlueprint,
      ...MARKET,
    }).result;
    expect(result).toEqual(zeroed);
  });
});
