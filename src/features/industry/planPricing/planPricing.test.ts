import { describe, expect, it, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '../blueprintCatalog';
import type { MarketSnapshot } from '../marketData';
import { resolveBuildPlan, type BuildPlanSources } from '../resolveBuildPlan';
import { planVerdictOf, pricePlan, productSalePrice, type DepthSource } from './index';

// Blueprint 1 makes one Widget (2) from 100 Tritanium (34).
const ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 1,
  blueprint: {
    name: 'Widget Blueprint',
    time: 3600,
    materials: [{ typeID: 34, quantity: 100 }],
    products: [{ typeID: 2, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  productTypeID: 2,
  productName: 'Widget',
  productNameLower: 'widget',
};
const CATALOG: BlueprintCatalog = {
  entries: [ENTRY],
  byBlueprintTypeID: new Map([[1, ENTRY]]),
  byProductTypeID: new Map([[2, ENTRY]]),
  typesById: {},
};
const SOURCES: BuildPlanSources = {
  catalog: CATALOG,
  pi: null,
  ownedBlueprints: [
    {
      item_id: 10,
      type_id: 1,
      quantity: 1,
      material_efficiency: 0,
      time_efficiency: 0,
      runs: -1,
      location_id: 60003760,
      location_flag: 'Hangar',
    },
  ],
  assumedMe: 0,
  modifiers: NO_CHARACTER_MODIFIERS,
  bpcOffersFor: () => [],
};

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'p',
    characterId: 1,
    name: 'Widgets',
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    hubPrices: { 2: 100_000, 34: 500 },
    hubBuyPrices: { 2: 90_000, 34: 300 },
    hubSellVolumes: { 2: 10, 34: 1_000_000 },
    adjustedPrices: { 34: 1 },
    systemCostIndex: 0.05,
    ...overrides,
  };
}

/** An in-memory book: every need fills at `avg`. */
function depthAt(avg: number): DepthSource {
  return vi.fn(async (_hub, needs: ReadonlyMap<number, number>) => {
    const depth = new Map<number, DepthPrice>();
    for (const [typeID, need] of needs) {
      depth.set(typeID, {
        best: 500,
        avg,
        need,
        filled: need,
        listed: need,
        covered: true,
        levels: [],
      });
    }
    return depth;
  });
}

const OWNS_ALL = { 34: { ownedQuantity: 100 } };

describe('productSalePrice', () => {
  it.each([
    ['an ordinary sell order', { 2: 100 }, { 2: 90 }, { price: 100, capped: false }],
    [
      'a troll order, capped at the average',
      { 2: 1_000_000 },
      { 2: 90 },
      { price: 90, capped: true },
    ],
    ['no average: no cap', { 2: 1_000_000 }, undefined, { price: 1_000_000, capped: false }],
    ['no sell order', {}, { 2: 90 }, { price: null, capped: false }],
  ])('%s', (_label, hubPrices, averagePrices, expected) => {
    expect(productSalePrice(snapshot({ hubPrices, averagePrices }), 2)).toEqual(expected);
  });

  it('is null with no snapshot or no product', () => {
    expect(productSalePrice(null, 2)).toEqual({ price: null, capped: false });
    expect(productSalePrice(snapshot(), null)).toEqual({ price: null, capped: false });
  });
});

describe('planVerdictOf', () => {
  const verdictFor = (
    profitBasis: ProfitBasis,
    over: Partial<BuildPlanRecord> = {},
    snap = snapshot()
  ) =>
    planVerdictOf(resolveBuildPlan(plan(over), SOURCES, { snapshot: snap }), {
      snapshot: snap,
      productTypeID: 2,
      productQuantity: 1,
      profitBasis,
      modifiers: NO_CHARACTER_MODIFIERS,
      standing: undefined,
    });

  it('on the sell-value basis charges owned stock at what it would sell for', () => {
    const free = verdictFor('free', { materialSourcing: OWNS_ALL });
    const sell = verdictFor('sellValue', { materialSourcing: OWNS_ALL });
    expect(sell.basis).toBe('sellValue');
    expect(sell.forgone).toBeGreaterThan(0);
    expect(sell.basisResult!.profit).toBeCloseTo(free.basisResult!.profit! - sell.forgone);
    expect(sell.figures!.profit).toBe(sell.basisResult!.profit);
    // Cost columns keep the plan's own total.
    expect(sell.basisResult!.totalCost).toBe(sell.resolved.result!.totalCost);
  });

  it('on the free basis keeps the plan’s own figures and forgoes nothing', () => {
    const free = verdictFor('free', { materialSourcing: OWNS_ALL });
    expect(free.basis).toBe('free');
    expect(free.forgone).toBe(0);
    expect(free.basisResult).toEqual(free.resolved.result);
  });

  it('with nothing owned there is no basis to switch', () => {
    const sell = verdictFor('sellValue');
    expect(sell.basis).toBeNull();
    expect(sell.forgone).toBe(0);
    expect(sell.basisResult).toEqual(sell.resolved.result);
  });

  it('prices the product at the capped sell price and says so', () => {
    const snap = snapshot({ hubPrices: { 2: 10_000_000, 34: 500 }, averagePrices: { 2: 100_000 } });
    const verdict = verdictFor('free', {}, snap);
    expect(verdict.productUnitPrice).toBe(100_000);
    expect(verdict.priceCapped).toBe(true);
    // Revenue was priced at the cap too, so the headroom reads off one price.
    expect(verdict.resolved.result!.revenue).toBe(100_000);
    expect(verdict.figures!.headroomPct).toBeCloseTo(
      ((100_000 - verdict.figures!.breakEvenPrice!) / 100_000) * 100
    );
  });

  it('reads the product sold into buy orders on the hero’s basis', () => {
    const sell = verdictFor('sellValue', { materialSourcing: OWNS_ALL });
    expect(sell.sellNow?.unitPrice).toBe(90_000);
    expect(sell.sellNow?.forgone).toBe(sell.forgone);
  });
});

describe('pricePlan', () => {
  const thin = snapshot({ hubSellVolumes: { 2: 10, 34: 1_000 } });

  it('re-resolves at Depth Prices when a need is large against what the hub lists', async () => {
    const depth = depthAt(800);
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: thin },
      {
        depth,
        profitBasis: 'free',
      }
    );
    expect(depth).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      new Map([[34, 100]])
    );
    expect(verdict.depth.get(34)?.avg).toBe(800);
    expect(verdict.resolved.materialPrices[34]).toBe(800);
    expect(verdict.resolved.result!.materialCost).toBe(80_000);
  });

  it('prices the walked materials at the Industry percent, as the snapshot already is', async () => {
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: thin },
      { depth: depthAt(800), profitBasis: 'free', pricePercent: 90 }
    );
    expect(verdict.resolved.materialPrices[34]).toBe(720);
    expect(verdict.resolved.result!.materialCost).toBe(72_000);
  });

  it('walks nothing when the need is small against the listing', async () => {
    const depth = depthAt(800);
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: snapshot() },
      {
        depth,
        profitBasis: 'free',
      }
    );
    expect(depth).not.toHaveBeenCalled();
    expect(verdict.depth.size).toBe(0);
    expect(verdict.resolved.result!.materialCost).toBe(50_000);
  });

  it('keeps lowest sells when the books fail to load', async () => {
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: thin },
      {
        depth: () => Promise.reject(new Error('book outage')),
        profitBasis: 'free',
      }
    );
    expect(verdict.resolved.result!.materialCost).toBe(50_000);
  });

  it('with no depth source prices at the depth prices already given (a Build Group walk)', async () => {
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: thin, depthPrices: { 34: 700 } },
      { depth: null, profitBasis: 'free' }
    );
    expect(verdict.resolved.result!.materialCost).toBe(70_000);
  });

  it.each<[ProfitBasis]>([['free'], ['sellValue']])(
    'reads the hero on the %s basis exactly as planVerdictOf does',
    async (profitBasis) => {
      const owned = plan({ materialSourcing: OWNS_ALL });
      const snap = snapshot({
        hubPrices: { 2: 10_000_000, 34: 500 },
        averagePrices: { 2: 100_000 },
      });
      const verdict = await pricePlan(
        owned,
        SOURCES,
        { snapshot: snap },
        {
          depth: depthAt(800),
          profitBasis,
        }
      );
      const direct = planVerdictOf(resolveBuildPlan(owned, SOURCES, { snapshot: snap }), {
        snapshot: snap,
        productTypeID: 2,
        productQuantity: 1,
        profitBasis,
        modifiers: NO_CHARACTER_MODIFIERS,
        standing: undefined,
      });
      expect(verdict.basisResult).toEqual(direct.basisResult);
      expect(verdict.priceCapped).toBe(true);
      expect(verdict.productUnitPrice).toBe(100_000);
    }
  );

  it('resolves the group pass when asked', async () => {
    const verdict = await pricePlan(
      plan(),
      SOURCES,
      { snapshot: snapshot() },
      {
        depth: null,
        profitBasis: 'free',
        withGroupResult: true,
      }
    );
    expect(verdict.resolved.groupResult).not.toBeNull();
  });
});
