import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import { effectiveMaterials } from '@/engine/industry/materials';
import { FACILITY_PRESETS, type IndustryBlueprint } from '@/engine/industry/types';
import { planStockRuns } from './planStockRuns';

const TRITANIUM = 34;
const bp: IndustryBlueprint = {
  name: 'Test',
  time: 1,
  materials: [{ typeID: TRITANIUM, quantity: 100 }],
  products: [{ typeID: 1, quantity: 1 }],
};
const ctx = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
} as const;

const resolveQuantitiesAt = ((candidate: BuildPlanRecord) => ({
  result: {
    materials: effectiveMaterials(bp, candidate.runs, 0, { ...ctx, rigFit: [...ctx.rigFit] }).map(
      (m) => ({ ...m, ownedQuantity: 0, remainingQuantity: m.quantity })
    ),
  },
})) as never;

const plan = {
  runs: 1,
  materialSourcing: { [TRITANIUM]: { ownedQuantity: 5 } },
} as unknown as BuildPlanRecord;

describe('planStockRuns', () => {
  it('counts the stock offered, not the Have typed on the plan', () => {
    expect(planStockRuns({ plan, resolveQuantitiesAt, availableFor: () => 450 })).toEqual({
      runs: 4,
      limiting: TRITANIUM,
    });
  });

  it('shows nothing when none of the materials is owned', () => {
    expect(planStockRuns({ plan, resolveQuantitiesAt, availableFor: () => 0 })).toBeNull();
  });
});
