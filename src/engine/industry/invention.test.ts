import { describe, expect, it } from 'vitest';
import {
  INVENTED_BASE_ME,
  INVENTED_BASE_TE,
  inventionChance,
  inventionOffers,
  inventionQuote,
  researchJobFee,
  type InventionQuoteInputs,
} from './invention';
import { FACILITY_PRESETS } from './types';

// Hand-worked example (a Gyrostabilizer II-style module): base chance 34%,
// both science skills at IV and the encryption skill at III, 8 + 8 datacores,
// an 18,400 ISK copy job and a 525,600 ISK invention fee.
//   chance  = 0.34 × (1 + (4 + 4)/30 + 3/40) = 0.456166…
//   attempt = 8 × 285,000 + 8 × 262,000 + 18,400 + 525,600 = 4,920,000
const ATTAINMENT = {
  typeID: 34202,
  name: 'Attainment Decryptor',
  probabilityMultiplier: 1.8,
  me: -1,
  te: 4,
  runs: 4,
  unitPrice: 3_900_000,
};
const OPTIMIZED_ATTAINMENT = {
  typeID: 34207,
  name: 'Optimized Attainment Decryptor',
  probabilityMultiplier: 1.9,
  me: 1,
  te: -2,
  runs: 2,
  unitPrice: 2_400_000,
};

function inputs(overrides: Partial<InventionQuoteInputs> = {}): InventionQuoteInputs {
  return {
    baseProbability: 0.34,
    baseRuns: 10,
    skills: { science: [4, 4], encryption: 3 },
    datacores: [
      { typeID: 20418, quantity: 8, unitPrice: 285_000 },
      { typeID: 20424, quantity: 8, unitPrice: 262_000 },
    ],
    copyJobFee: 18_400,
    inventionJobFee: 525_600,
    decryptors: [ATTAINMENT, OPTIMIZED_ATTAINMENT],
    ...overrides,
  };
}

describe('inventionChance', () => {
  it('scales the base chance by the science and encryption skills', () => {
    expect(inventionChance(0.34, { science: [4, 4], encryption: 3 })).toBeCloseTo(0.456167, 6);
  });

  it('applies the decryptor multiplier on top', () => {
    expect(inventionChance(0.34, { science: [4, 4], encryption: 3 }, 1.8)).toBeCloseTo(0.8211, 6);
  });

  it('is the bare base chance with no skills trained', () => {
    expect(inventionChance(0.3, { science: [0, 0], encryption: 0 })).toBe(0.3);
  });

  it('never exceeds certainty', () => {
    expect(inventionChance(0.5, { science: [5, 5], encryption: 5 }, 1.9)).toBe(1);
  });
});

describe('inventionQuote', () => {
  it('prices the no-decryptor tier: attempt ÷ chance ÷ runs', () => {
    const quote = inventionQuote(inputs());
    expect(quote.datacoreCost).toBe(4_376_000);
    expect(quote.attemptCost).toBe(4_920_000);
    expect(quote.chance).toBeCloseTo(0.456167, 6);
    const none = quote.tiers[0]!;
    expect(none.decryptor).toBeNull();
    expect(none).toMatchObject({ me: INVENTED_BASE_ME, te: INVENTED_BASE_TE, runs: 10 });
    expect(none.attemptCost).toBe(4_920_000);
    expect(none.expectedCostPerCopy).toBeCloseTo(10_785_531.6, 1);
    expect(none.expectedCostPerRun).toBeCloseTo(1_078_553.16, 2);
  });

  it('prices a decryptor tier with its chance, ME/TE and runs', () => {
    const tier = inventionQuote(inputs()).tiers[1]!;
    expect(tier.decryptor?.typeID).toBe(34202);
    expect(tier.chance).toBeCloseTo(0.8211, 6);
    expect(tier).toMatchObject({ me: 1, te: 8, runs: 14 });
    expect(tier.attemptCost).toBe(8_820_000);
    expect(tier.expectedCostPerCopy).toBeCloseTo(10_741_687.98, 2);
    expect(tier.expectedCostPerRun).toBeCloseTo(767_263.43, 2);
  });

  it('prices a second decryptor tier the same way', () => {
    const tier = inventionQuote(inputs()).tiers[2]!;
    expect(tier.chance).toBeCloseTo(0.866717, 6);
    expect(tier).toMatchObject({ me: 3, te: 2, runs: 12 });
    expect(tier.attemptCost).toBe(7_320_000);
    expect(tier.expectedCostPerRun).toBeCloseTo(703_805.55, 2);
  });

  it('lists every datacore line with its cost', () => {
    expect(inventionQuote(inputs()).datacores).toEqual([
      { typeID: 20418, quantity: 8, unitPrice: 285_000, lineCost: 2_280_000 },
      { typeID: 20424, quantity: 8, unitPrice: 262_000, lineCost: 2_096_000 },
    ]);
  });

  it('leaves only an unpriced decryptor’s own tier unpriced', () => {
    const quote = inventionQuote(
      inputs({ decryptors: [{ ...ATTAINMENT, unitPrice: null }, OPTIMIZED_ATTAINMENT] })
    );
    expect(quote.tiers[0]!.expectedCostPerRun).not.toBeNull();
    expect(quote.tiers[1]!.attemptCost).toBeNull();
    expect(quote.tiers[1]!.expectedCostPerRun).toBeNull();
    expect(quote.tiers[2]!.expectedCostPerRun).not.toBeNull();
  });

  it('leaves every tier unpriced when a datacore has no price', () => {
    const quote = inventionQuote(
      inputs({
        datacores: [
          { typeID: 20418, quantity: 8, unitPrice: null },
          { typeID: 20424, quantity: 8, unitPrice: 262_000 },
        ],
      })
    );
    expect(quote.datacoreCost).toBeNull();
    expect(quote.attemptCost).toBeNull();
    expect(quote.tiers.every((tier) => tier.expectedCostPerRun === null)).toBe(true);
  });

  it('leaves every tier unpriced when the copy job cannot run (no T1 original)', () => {
    const quote = inventionQuote(inputs({ copyJobFee: null }));
    expect(quote.attemptCost).toBeNull();
    expect(quote.tiers.every((tier) => tier.expectedCostPerCopy === null)).toBe(true);
  });

  it('floors an invented copy at ME 0, TE 0 and one run', () => {
    const quote = inventionQuote(
      inputs({
        baseRuns: 1,
        decryptors: [
          {
            typeID: 1,
            name: 'Harsh',
            probabilityMultiplier: 1,
            me: -5,
            te: -9,
            runs: -3,
            unitPrice: 1,
          },
        ],
      })
    );
    expect(quote.tiers[1]).toMatchObject({ me: 0, te: 0, runs: 1 });
  });
});

describe('inventionOffers', () => {
  it('turns each priced tier into an invented copy offer priced per successful copy', () => {
    const offers = inventionOffers(
      inventionQuote(
        inputs({ decryptors: [{ ...ATTAINMENT, unitPrice: null }, OPTIMIZED_ATTAINMENT] })
      )
    );
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ me: 2, te: 4, runs: 10, quantity: 1, invented: true });
    expect(offers[0]!.price).toBeCloseTo(10_785_531.6, 1);
    expect(offers[1]).toMatchObject({ me: 3, te: 2, runs: 12, quantity: 1, invented: true });
  });

  it('offers nothing when the attempt cannot be priced', () => {
    expect(inventionOffers(inventionQuote(inputs({ copyJobFee: null })))).toEqual([]);
  });
});

describe('researchJobFee', () => {
  it('charges the job fee on 2% of one run’s estimated item value', () => {
    // EIV = 10 × 1,000 + 5 × 2,000 = 20,000; 2% = 400.
    // 400 × (5% index + 0.25% NPC tax + 4% SCC) = 37
    const fee = researchJobFee(
      {
        materials: [
          { typeID: 34, quantity: 10 },
          { typeID: 35, quantity: 5 },
        ],
      },
      { 34: 1_000, 35: 2_000 },
      0.05,
      FACILITY_PRESETS.npcStation
    );
    expect(fee).toBeCloseTo(37, 6);
  });
});
