import { describe, expect, it } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { InventionData, SkillType } from '@/sde/types';
import {
  inventionOffersLookup,
  inventionQuoteFor,
  inventionRecipes,
  type InventionMarket,
  type InventionPricingContext,
} from './inventionSources';
import type { BlueprintCatalog } from './blueprintCatalog';

const T1_BP = 1000;
const T2_BP = 2000;
const T2_PRODUCT_BP = 2000;

const DATA: InventionData = {
  blueprints: {
    [T1_BP]: {
      copyTime: 600,
      invention: {
        time: 6000,
        materials: [
          { typeID: 20418, quantity: 8 },
          { typeID: 20424, quantity: 8 },
        ],
        products: [{ typeID: T2_BP, quantity: 10, probability: 0.34 }],
        skills: [
          { typeID: 11452, level: 1 },
          { typeID: 11445, level: 1 },
          { typeID: 21791, level: 1 },
          { typeID: 3400, level: 1 },
        ],
      },
    },
    // Copies only: no invention row.
    3000: { copyTime: 600 },
  },
  decryptors: {
    34202: { name: 'Attainment Decryptor', probabilityMultiplier: 1.8, me: -1, te: 4, runs: 4 },
  },
};

function skill(typeID: number, name: string, groupID: number): SkillType {
  return { typeID, name, groupID } as SkillType;
}

const SKILLS: SkillType[] = [
  skill(11452, 'Mechanical Engineering', 270),
  skill(11445, 'Minmatar Starship Engineering', 270),
  skill(21791, 'Minmatar Encryption Methods', 270),
  skill(3400, 'Outpost Construction', 268),
];

describe('inventionRecipes', () => {
  it('indexes each invented blueprint by its own typeID, sorting its skills', () => {
    const recipe = inventionRecipes(DATA, SKILLS, [T2_BP, 9999]).get(T2_BP);
    expect(recipe).toEqual({
      t1BlueprintTypeID: T1_BP,
      baseProbability: 0.34,
      baseRuns: 10,
      datacores: [
        { typeID: 20418, quantity: 8 },
        { typeID: 20424, quantity: 8 },
      ],
      scienceSkills: [
        { typeID: 11452, name: 'Mechanical Engineering' },
        { typeID: 11445, name: 'Minmatar Starship Engineering' },
      ],
      encryptionSkill: { typeID: 21791, name: 'Minmatar Encryption Methods' },
    });
  });

  it('leaves out blueprints nothing invents', () => {
    expect(inventionRecipes(DATA, SKILLS, [T1_BP, 3000]).size).toBe(0);
  });
});

const MARKET: InventionMarket = {
  recipeFor: (id) => inventionRecipes(DATA, SKILLS, [T2_BP]).get(id) ?? null,
  decryptors: [
    {
      typeID: 34202,
      name: 'Attainment Decryptor',
      probabilityMultiplier: 1.8,
      me: -1,
      te: 4,
      runs: 4,
    },
  ],
  unitPriceFor: (id) => ({ 20418: 285_000, 20424: 262_000, 34202: 3_900_000 })[id as 20418] ?? null,
};

const CATALOG = {
  byBlueprintTypeID: new Map([
    [T1_BP, { blueprint: { materials: [{ typeID: 34, quantity: 100 }] } }],
    [T2_PRODUCT_BP, { blueprint: { materials: [{ typeID: 35, quantity: 1_000 }] } }],
  ]),
} as unknown as Pick<BlueprintCatalog, 'byBlueprintTypeID'>;

function context(overrides: Partial<InventionPricingContext> = {}): InventionPricingContext {
  return {
    market: MARKET,
    catalog: CATALOG,
    ownedBlueprints: [{ type_id: T1_BP, runs: -1 }],
    skills: { 11452: 4, 11445: 4, 21791: 3 },
    facility: FACILITY_PRESETS.npcStation,
    adjustedPrices: { 34: 10, 35: 1_000 },
    copyingCostIndex: 0.05,
    inventionCostIndex: 0.1,
    ...overrides,
  };
}

describe('inventionQuoteFor', () => {
  it('prices the attempt from datacores, the copy job and the invention fee', () => {
    const result = inventionQuoteFor(T2_BP, context())!;
    expect(result.skills).toEqual({ science: [4, 4], encryption: 3 });
    // Copy: 2% × (100 × 10) = 20, × (5% + 0.25% + 4%) = 1.85.
    expect(result.quote.copyJobFee).toBeCloseTo(1.85, 6);
    // Invention: 2% × (1,000 × 1,000) = 20,000, × (10% + 0.25% + 4%) = 2,850.
    expect(result.quote.inventionJobFee).toBeCloseTo(2_850, 6);
    expect(result.quote.attemptCost).toBeCloseTo(4_376_000 + 1.85 + 2_850, 6);
    expect(result.quote.tiers).toHaveLength(2);
    expect(result.quote.tiers[1]?.decryptor?.unitPrice).toBe(3_900_000);
  });

  it('prices no copy job without an owned T1 original', () => {
    const result = inventionQuoteFor(
      T2_BP,
      context({ ownedBlueprints: [{ type_id: T1_BP, runs: 5 }] })
    )!;
    expect(result.quote.copyJobFee).toBeNull();
    expect(result.quote.attemptCost).toBeNull();
  });

  it('counts an untrained skill as level 0', () => {
    expect(inventionQuoteFor(T2_BP, context({ skills: {} }))!.skills).toEqual({
      science: [0, 0],
      encryption: 0,
    });
  });

  it('is null for a blueprint nothing invents', () => {
    expect(inventionQuoteFor(T1_BP, context())).toBeNull();
  });
});

describe('inventionOffersLookup', () => {
  it('offers every priced invention tier, marked invented', () => {
    const offers = inventionOffersLookup(context())(T2_BP);
    expect(offers).toHaveLength(2);
    expect(offers.every((offer) => offer.invented)).toBe(true);
  });

  it('offers nothing without an owned T1 original', () => {
    expect(inventionOffersLookup(context({ ownedBlueprints: [] }))(T2_BP)).toEqual([]);
  });
});
