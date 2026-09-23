import { describe, expect, it } from 'vitest';
import { buildVsBuy } from './buildVsBuy';
import { EMPTY_RIG_FIT, FACILITY_PRESETS, SKILL_IDS } from './types';
import type { IndustryBlueprint, IndustryInputs } from './types';
import { computeMarketWideRows, selectLiquidCandidates } from './marketWideOpportunities';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';

function mods(skills: Record<number, number>) {
  return characterModifiers({ skills, implantTypeIds: [] });
}

describe('selectLiquidCandidates', () => {
  const candidates = [
    { productTypeID: 1, marketGroupID: 100, sellPrice: 10, sellVolume: 1_000_000 }, // depth 10M
    { productTypeID: 2, marketGroupID: 100, sellPrice: 10, sellVolume: 5_000_000 }, // depth 50M
    { productTypeID: 3, marketGroupID: 100, sellPrice: 1, sellVolume: 100 }, // depth 100 - below floor
    { productTypeID: 4, marketGroupID: 200, sellPrice: 100, sellVolume: 1_000_000 }, // depth 100M
    { productTypeID: 5, marketGroupID: null, sellPrice: null, sellVolume: null }, // unpriceable
  ];

  it('drops candidates below the liquidity floor', () => {
    const result = selectLiquidCandidates(candidates, 1_000_000, 10);
    expect(result.map((c) => c.productTypeID)).not.toContain(3);
    expect(result.map((c) => c.productTypeID)).not.toContain(5);
  });

  it('caps each Market Group category to the top N by sell depth', () => {
    const result = selectLiquidCandidates(candidates, 1_000_000, 1);
    // group 100 has two candidates clearing the floor (1, 2); only the
    // deepest (2) should survive a top-1 cap. Group 200's lone candidate (4)
    // survives regardless.
    expect(result.map((c) => c.productTypeID).sort()).toEqual([2, 4]);
  });

  it('treats a null Market Group as its own single bucket, never merged with another null', () => {
    const withTwoUngrouped = [
      { productTypeID: 10, marketGroupID: null, sellPrice: 10, sellVolume: 1_000_000 },
      { productTypeID: 11, marketGroupID: null, sellPrice: 20, sellVolume: 1_000_000 },
    ];
    // Top-1 per group would drop one of these if both null-group candidates
    // shared a bucket; each survives because a null group never merges.
    const result = selectLiquidCandidates(withTwoUngrouped, 1_000_000, 1);
    expect(result.map((c) => c.productTypeID).sort()).toEqual([10, 11]);
  });

  it('returns an empty list when nothing clears the floor', () => {
    expect(selectLiquidCandidates(candidates, 1_000_000_000, 10)).toEqual([]);
  });
});

describe('computeMarketWideRows', () => {
  const tree = {
    blueprintTypeID: 900,
    time: 3600, // 1 hour
    outputQuantity: 1,
    marketGroupID: 100,
    materials: [
      { typeID: 50, quantity: 10 },
      { typeID: 51, quantity: 5 },
    ],
  };

  const noFee = { adjustedPrices: {}, systemCostIndex: 0, modifiers: NO_CHARACTER_MODIFIERS };

  it('computes ISK/hour from flattened materials, sell price, and time — net of sales tax and broker fee even at untrained skills', () => {
    const rows = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([
        [50, 10], // 10 * 10 = 100
        [51, 20], // 5 * 20 = 100
      ]),
      noFee // no adjusted prices -> EIV 0 -> job fee 0, isolates the tax/broker fix
    );
    // materialCost = 200, no job fee (EIV 0) -> buildCost = 200.
    // revenue = 1000. Untrained: salesTax 7.5% -> 75; broker 3% of 1000 = 30,
    // floored to the 100 ISK minimum -> 100. profit = 1000-75-100-200 = 625.
    expect(rows).toEqual([
      expect.objectContaining({ id: '1', iskPerHour: 625, buildCost: 200, orderDepth: 'deep' }),
    ]);
  });

  it('includes the job installation fee via adjusted prices and the system cost index', () => {
    const feeTree = {
      blueprintTypeID: 901,
      time: 3600,
      outputQuantity: 1,
      marketGroupID: 100,
      materials: [{ typeID: 60, quantity: 10 }],
    };
    const rows = computeMarketWideRows(
      [{ productTypeID: 2, tree: feeTree, sellPrice: 2000, sellDepthIsk: 5_000_000 }],
      new Map([[60, 50]]), // materialCost = 10 * 50 = 500
      { adjustedPrices: { 60: 10_000 }, systemCostIndex: 0.05, modifiers: NO_CHARACTER_MODIFIERS } // EIV 100,000 at a 5% index
    );
    // jobFee(100_000, 0.05, npcStation): grossCost 5000, SCC 4000, tax 250 -> 9250.
    // buildCost = 500 + 9250 = 9750. revenue 2000, untrained tax 150, broker
    // floored to 100. profit = 2000-150-100-9750 = -8000.
    expect(rows).toEqual([
      expect.objectContaining({ id: '2', iskPerHour: -8000, buildCost: 9750 }),
    ]);
  });

  it('nets sales tax and broker fee at the character’s Accounting/Broker Relations levels', () => {
    const rows = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 10_000, sellDepthIsk: 5_000_000 }],
      new Map([
        [50, 10],
        [51, 20],
      ]),
      { ...noFee, modifiers: mods({ [SKILL_IDS.accounting]: 5, [SKILL_IDS.brokerRelations]: 5 }) }
    );
    // buildCost = 200 (no job fee). revenue = 10_000. Accounting V:
    // 7.5%*(1-0.11*5) = 3.375% -> tax 337.5. Broker Relations V:
    // 3%-0.3%*5 = 1.5% -> 150 (above the 100 ISK floor, so skill-driven).
    // profit = 10_000-337.5-150-200 = 9312.5.
    expect(rows).toEqual([
      expect.objectContaining({ id: '1', iskPerHour: 9312.5, buildCost: 200 }),
    ]);
  });

  it('shortens time — and raises ISK/hour — with trained Industry/Advanced Industry skills', () => {
    const untrained = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([
        [50, 10],
        [51, 20],
      ]),
      noFee
    );
    const trained = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([
        [50, 10],
        [51, 20],
      ]),
      {
        ...noFee,
        modifiers: mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 5 }),
      }
    );
    // Same profit (625) either way — skills here don't touch tax/broker —
    // but the trained run's 3600s baked time shrinks to 3600 * (1-0.2) *
    // (1-0.15) = 2448s, so ISK/hour rises accordingly.
    expect(untrained[0]!.iskPerHour).toBeCloseTo(625, 6);
    expect(trained[0]!.iskPerHour).toBeCloseTo((625 / 2448) * 3600, 6);
    expect(trained[0]!.iskPerHour!).toBeGreaterThan(untrained[0]!.iskPerHour!);
  });

  it("shortens time further using the candidate's own blueprint science skills (issue #1228/#1230)", () => {
    const rows = computeMarketWideRows(
      [
        {
          productTypeID: 1,
          tree,
          sellPrice: 1000,
          sellDepthIsk: 5_000_000,
          blueprintSkills: [{ typeID: 3395, level: 3 }], // blueprint requires ASSC III to build
        },
      ],
      new Map([
        [50, 10],
        [51, 20],
      ]),
      { ...noFee, modifiers: mods({ 3395: 3 }) } // character trained ASSC III
    );
    // Same profit (625) as the untrained baseline — only time changes.
    // 3600s * (1 - 0.01*3) = 3492s.
    expect(rows[0]!.iskPerHour).toBeCloseTo((625 / 3492) * 3600, 6);
  });

  it('excludes a row when any flattened material has no known price', () => {
    const rows = computeMarketWideRows(
      [{ productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 }],
      new Map([[50, 10]]), // typeID 51 missing
      noFee
    );
    expect(rows).toEqual([]);
  });

  it('ranks multiple rows by ISK/hour descending', () => {
    const cheapTree = { ...tree, materials: [{ typeID: 50, quantity: 1 }] };
    const rows = computeMarketWideRows(
      [
        { productTypeID: 1, tree, sellPrice: 1000, sellDepthIsk: 5_000_000 },
        { productTypeID: 2, tree: cheapTree, sellPrice: 1000, sellDepthIsk: 5_000_000 },
      ],
      new Map([
        [50, 10],
        [51, 20],
      ]),
      noFee
    );
    expect(rows.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('reports the same ISK/hour as the owned-blueprint panel for an equivalent product, including time skills (issue #1230 AC2)', () => {
    // Same product/recipe/runs(1)/ME(0)/facility(NPC)/skills/prices on both
    // paths — the two panels' "ISK/hour" must agree at the same basis,
    // including Industry/Advanced Industry and a blueprint science skill —
    // not just the tax/broker skills the pre-#1230 version of this test
    // covered, which passed even while the market-wide side ignored time
    // skills entirely.
    const productTypeID = 999;
    const materialTypeID = 70;
    const skills = {
      [SKILL_IDS.accounting]: 2,
      [SKILL_IDS.brokerRelations]: 1,
      [SKILL_IDS.industry]: 4,
      [SKILL_IDS.advancedIndustry]: 3,
      3395: 2, // Advanced Small Ship Construction II
    };
    const adjustedPrices = { [materialTypeID]: 2000 };
    const systemCostIndex = 0.03;
    const materialHubPrice = 80;
    const productHubPrice = 1500;

    const blueprint: IndustryBlueprint = {
      name: 'Equivalence Widget',
      time: 3600,
      materials: [{ typeID: materialTypeID, quantity: 8 }],
      products: [{ typeID: productTypeID, quantity: 1 }],
      skills: [{ typeID: 3395, level: 2 }],
    };
    const ownedInputs: IndustryInputs = {
      blueprint,
      runs: 1,
      me: 0,
      te: 0,
      facility: FACILITY_PRESETS.npcStation,
      rigFit: EMPTY_RIG_FIT,
      security: 'highsec',
      systemCostIndex,
      adjustedPrices,
      hubPrices: { [materialTypeID]: materialHubPrice, [productTypeID]: productHubPrice },
      modifiers: mods(skills),
    };
    const ownedResult = buildVsBuy(ownedInputs);

    const equivalentTree = {
      blueprintTypeID: 1,
      time: blueprint.time,
      outputQuantity: 1,
      marketGroupID: 100,
      materials: blueprint.materials,
    };
    const marketWideRows = computeMarketWideRows(
      [
        {
          productTypeID,
          tree: equivalentTree,
          sellPrice: productHubPrice,
          sellDepthIsk: 5_000_000,
          blueprintSkills: blueprint.skills,
        },
      ],
      new Map([[materialTypeID, materialHubPrice]]),
      { adjustedPrices, systemCostIndex, modifiers: mods(skills) }
    );

    expect(ownedResult.iskPerHour).not.toBeNull();
    expect(marketWideRows[0]!.iskPerHour).toBeCloseTo(ownedResult.iskPerHour!, 6);
  });
});
