import { describe, it, expect } from 'vitest';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint, MaterialCostLine } from '@/engine/industry/types';
import { materialCostLines } from '@/engine/industry/sourcing';
import { planSubBuild } from './subBuild';

const CTX = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'] as const,
  security: 'highsec' as const,
  systemCostIndex: 0.05,
  adjustedPrices: {} as Record<number, number>,
  modifiers: NO_CHARACTER_MODIFIERS,
};

function recipe(overrides: Partial<IndustryBlueprint> = {}): IndustryBlueprint {
  return {
    name: 'Seal Blueprint',
    time: 1800,
    materials: [{ typeID: 57457, quantity: 10 }],
    products: [{ typeID: 57478, quantity: 3 }],
    ...overrides,
  };
}

function parent(typeID: number, quantity: number, owned = 0): MaterialCostLine {
  return materialCostLines(
    [{ typeID, baseQuantity: quantity, quantity }],
    {},
    { [typeID]: { ownedQuantity: owned } }
  )[0];
}

describe('planSubBuild past the max production limit', () => {
  it('splits into even jobs, rounds each, and quotes the longest job', () => {
    const limited = recipe({ maxProductionLimit: 20 });
    const sub = planSubBuild(parent(57478, 150), limited, 10, CTX);

    expect(sub?.runs).toBe(50);
    expect(sub?.jobRuns).toEqual([17, 17, 16]);
    const perJob = [17, 17, 16].map(
      (r) => planSubBuild(parent(57478, r * 3), recipe(), 10, CTX)!.inputs[0].quantity
    );
    expect(sub?.inputs[0].quantity).toBe(perJob.reduce((a, b) => a + b, 0));
    expect(sub?.seconds).toBe(planSubBuild(parent(57478, 51), recipe(), 10, CTX)!.seconds);
  });

  it('leaves a job within the limit as it was', () => {
    const sub = planSubBuild(parent(57478, 150), recipe({ maxProductionLimit: 50 }), 0, CTX);
    const plain = planSubBuild(parent(57478, 150), recipe(), 0, CTX);
    expect(sub).toEqual(plain);
    expect(sub?.jobRuns).toEqual([50]);
  });
});

describe('planSubBuild', () => {
  it('sizes the job in runs, not units — a recipe that yields three per run needs a third of the runs', () => {
    const sub = planSubBuild(parent(57478, 150), recipe(), 0, CTX);

    expect(sub?.runs).toBe(50);
    expect(sub?.outputPerRun).toBe(3);
    expect(sub?.unitsMade).toBe(150);
    expect(sub?.spare).toBe(0);
  });

  it('reports the overshoot when the output does not divide the requirement evenly', () => {
    const sub = planSubBuild(parent(57478, 76), recipe(), 0, CTX);

    expect(sub?.runs).toBe(26);
    expect(sub?.unitsMade).toBe(78);
    expect(sub?.spare).toBe(2);
  });

  it('sizes the job to what is still needed, not the whole requirement', () => {
    const sub = planSubBuild(parent(57478, 150, 60), recipe(), 0, CTX);

    expect(sub?.needed).toBe(90);
    expect(sub?.runs).toBe(30);
    expect(sub?.inputs).toEqual([{ typeID: 57457, baseQuantity: 300, quantity: 300 }]);
  });

  it('rounds materials once for the whole job, the way EVE does, not once per run', () => {
    const sub = planSubBuild(
      parent(57478, 21),
      recipe({ materials: [{ typeID: 57457, quantity: 3 }] }),
      10,
      CTX
    );

    expect(sub?.runs).toBe(7);
    expect(sub?.inputs[0].quantity).toBe(19);
  });

  it('keeps the ME0 requirement beside the reduced one, so the saving is visible', () => {
    const sub = planSubBuild(parent(57478, 3), recipe(), 10, CTX);

    expect(sub?.inputs[0]).toEqual({ typeID: 57457, baseQuantity: 10, quantity: 9 });
  });

  it('charges the sub-job its own installation fee, priced off ME0 quantities', () => {
    const sub = planSubBuild(parent(57478, 3), recipe(), 10, {
      ...CTX,
      adjustedPrices: { 57457: 100 },
    });

    expect(sub?.jobFee.eiv).toBe(1000);
    expect(sub?.jobFee.total).toBeGreaterThan(0);
  });

  it('applies the context manufacturing-time implant bonus to the sub-job seconds (issue #1229)', () => {
    const sub = planSubBuild(parent(57478, 3), recipe(), 0, {
      ...CTX,
      modifiers: characterModifiers({ skills: {}, implantTypeIds: [27171] }),
    });

    expect(sub?.seconds).toBeCloseTo(1728, 6);
  });

  it('has nothing to plan for a material that is already fully owned', () => {
    expect(planSubBuild(parent(57478, 150, 150), recipe(), 0, CTX)).toBeNull();
  });

  it('has nothing to plan for a recipe that produces nothing', () => {
    expect(planSubBuild(parent(57478, 150), recipe({ products: [] }), 0, CTX)).toBeNull();
  });

  it('refuses bad data rather than throwing, so one broken recipe cannot blank the table', () => {
    expect(planSubBuild(parent(57478, 150), recipe(), 99, CTX)).toBeNull();
  });
});
