import { describe, it, expect } from 'vitest';
import { collectNameableTypeIds, computeLoyaltyOfferRows } from '@/features/loyalty/offerRows';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { brokerFee, salesTax } from '@/engine/industry/fees';

const ASTERO_BP_ID = 33397;
const ASTERO_ID = 33468;
const TRITANIUM_ID = 34;
const PROBE_ID = 30488;

function makeCatalog(): BlueprintCatalog {
  const entry: BlueprintCatalogEntry = {
    blueprintTypeID: ASTERO_BP_ID,
    productTypeID: ASTERO_ID,
    productName: 'Astero',
    productNameLower: 'astero',
    blueprint: {
      name: 'Astero Blueprint',
      time: 3600,
      materials: [{ typeID: TRITANIUM_ID, quantity: 1_000_000 }],
      products: [{ typeID: ASTERO_ID, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
  };
  return {
    entries: [entry],
    byBlueprintTypeID: new Map([[ASTERO_BP_ID, entry]]),
    byProductTypeID: new Map([[ASTERO_ID, entry]]),
    typesById: {
      [PROBE_ID]: { name: 'Sisters Combat Scanner Probe', groupID: 1, volume: 0.01 },
    },
  };
}

const astero: LoyaltyStoreOffer = {
  isk_cost: 12_000_000,
  lp_cost: 950_000,
  offer_id: 1,
  quantity: 1,
  required_items: [],
  type_id: ASTERO_BP_ID,
};

const probes: LoyaltyStoreOffer = {
  isk_cost: 96_000,
  lp_cost: 4_800,
  offer_id: 2,
  quantity: 8,
  required_items: [],
  type_id: PROBE_ID,
};

describe('computeLoyaltyOfferRows', () => {
  it('treats a catalog-known type_id as a blueprint offer and runs the manufacturing engine', () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: { [TRITANIUM_ID]: 4 },
      systemCostIndex: 0.05,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.isBlueprint).toBe(true);
    expect(row.productTypeId).toBe(ASTERO_ID);
    expect(row.build).not.toBeNull();
    // revenue 26M, materials 1,000,000 * 5 = 5M, isk_cost 12M -> profit ~9M minus a nonzero job fee
    expect(row.profit.profit).not.toBeNull();
    expect(row.build!.jobFee.total).toBeGreaterThan(0);
    expect(row.profit.profit).toBeLessThan(26_000_000 - 12_000_000 - 5_000_000);
    expect(row.profit.iskPerLp).not.toBeNull();
  });

  it('treats an unknown type_id as a plain item, priced straight off the hub', () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [probes],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 1_800 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.isBlueprint).toBe(false);
    expect(row.build).toBeNull();
    expect(row.itemName).toBe('Sisters Combat Scanner Probe');
    expect(row.profit.revenue).toBe(8 * 1_800);
    expect(row.profit.profit).toBeCloseTo(
      8 * 1_800 - salesTax(8 * 1_800, 0) - brokerFee(8 * 1_800, 0) - 96_000,
      6
    );
  });

  it("names a plain item from `itemNames` when catalog.typesById (the trimmed, blueprint/skill-referenced SDE snapshot) doesn't cover it — LP stores hand out plenty of items no blueprint or skill ever references, e.g. implants, Mindlinks, SKINs", () => {
    const MINDLINK_ID = 21890;
    const mindlink: LoyaltyStoreOffer = {
      isk_cost: 20_000_000,
      lp_cost: 20_000,
      offer_id: 4,
      quantity: 1,
      required_items: [],
      type_id: MINDLINK_ID,
    };
    const [row] = computeLoyaltyOfferRows({
      offers: [mindlink],
      catalog: makeCatalog(),
      hubPrices: { [MINDLINK_ID]: 50_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      itemNames: new Map([[MINDLINK_ID, 'Skirmish Command Mindlink']]),
      playerLp: 1_000_000,
    });

    expect(row.itemName).toBe('Skirmish Command Mindlink');
  });

  it('falls back to catalog.typesById, then `#typeId`, when `itemNames` has no entry', () => {
    const UNKNOWN_ID = 999_999;
    const unknown: LoyaltyStoreOffer = {
      isk_cost: 1,
      lp_cost: 1,
      offer_id: 5,
      quantity: 1,
      required_items: [],
      type_id: UNKNOWN_ID,
    };
    const [probeRow] = computeLoyaltyOfferRows({
      offers: [probes],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 1_800 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      itemNames: new Map(),
      playerLp: 1_000_000,
    });
    const [unknownRow] = computeLoyaltyOfferRows({
      offers: [unknown],
      catalog: makeCatalog(),
      hubPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      itemNames: new Map(),
      playerLp: 1_000_000,
    });

    expect(probeRow.itemName).toBe('Sisters Combat Scanner Probe');
    expect(unknownRow.itemName).toBe(`#${UNKNOWN_ID}`);
  });

  it('prices a plain item\'s revenue from `revenueHubPrices` (the "instant-sell to buy orders" basis) when given, instead of `hubPrices`', () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [probes],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 1_800 }, // sell basis — should be ignored for revenue here
      revenueHubPrices: { [PROBE_ID]: 1_500 }, // buy basis
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.profit.revenue).toBe(8 * 1_500);
  });

  it("defaults a plain item's revenue to `hubPrices` when `revenueHubPrices` isn't given — today's behavior, unchanged", () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [probes],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 1_800 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.profit.revenue).toBe(8 * 1_800);
  });

  it("prices a blueprint offer's product revenue from `revenueHubPrices` while materials stay priced at `hubPrices`", () => {
    const sellBasis = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    })[0];
    const buyBasis = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      revenueHubPrices: { [ASTERO_ID]: 24_000_000 }, // lower buy-order price for the built product
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    })[0];

    expect(sellBasis.profit.revenue).toBe(26_000_000);
    expect(buyBasis.profit.revenue).toBe(24_000_000);
    // Materials cost is unaffected by the revenue basis — same buildCost either way.
    expect(buyBasis.build!.materialCost).toBe(sellBasis.build!.materialCost);
    expect(buyBasis.profit.profit).toBeLessThan(sellBasis.profit.profit!);
  });

  it("nulls a blueprint offer's revenue when `revenueHubPrices` has no price for the product, even though `hubPrices` (the sell basis) does", () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      revenueHubPrices: {}, // no buy-order price for the product at this hub
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.profit.revenue).toBeNull();
    expect(row.profit.profit).toBeNull();
  });

  it('ranks the more profitable-per-LP offer first', () => {
    const rows = computeLoyaltyOfferRows({
      offers: [astero, probes],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000, [PROBE_ID]: 1_800 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(rows.map((r) => r.offer.offer_id)).toEqual([1, 2]);
  });

  it("recomputes a blueprint offer's profit when owned materials cover part of the build", () => {
    const base = {
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order' as const,
      playerLp: 1_000_000,
    };
    const buyAll = computeLoyaltyOfferRows({ ...base, materialSourcing: undefined })[0];
    const useOwned = computeLoyaltyOfferRows({
      ...base,
      materialSourcing: { [TRITANIUM_ID]: { ownedQuantity: 1_000_000 } },
      useOwnMaterialsFor: new Set([astero.offer_id]),
    })[0];

    expect(useOwned.profit.profit!).toBeGreaterThan(buyAll.profit.profit!);
  });

  it('applies materialSourcing only to offers named in useOwnMaterialsFor', () => {
    const withoutFlag = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: { [TRITANIUM_ID]: { ownedQuantity: 1_000_000 } },
      useOwnMaterialsFor: new Set(), // flag not set for this offer
      playerLp: 1_000_000,
    })[0];
    const buyAll = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    })[0];

    expect(withoutFlag.profit.profit).toBe(buyAll.profit.profit);
  });

  it('marks the row unpriceable when a material has no hub price', () => {
    const [row] = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [ASTERO_ID]: 26_000_000 }, // no Tritanium price
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.profit.profit).toBeNull();
    expect(row.profit.iskPerLp).toBeNull();
  });

  it("prices a blueprint offer's build at 1 run regardless of offer.quantity — ESI carries no max-run count for the copy", () => {
    const threeCopies: LoyaltyStoreOffer = { ...astero, offer_id: 3, quantity: 3 };
    const [row] = computeLoyaltyOfferRows({
      offers: [threeCopies],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    // 1 run of the fixture's blueprint needs 1,000,000 Tritanium, not 3,000,000.
    expect(row.build!.materials[0].baseQuantity).toBe(1_000_000);
  });
  it('charges the broker fee only on the "Sell (list order)" basis, sales tax on both', () => {
    const base = {
      offers: [probes],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 1_800 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      materialSourcing: undefined,
      playerLp: 1_000_000,
    };
    const [order] = computeLoyaltyOfferRows({ ...base, liquidationBasis: 'order' });
    const [instant] = computeLoyaltyOfferRows({ ...base, liquidationBasis: 'instant' });

    expect(order.profit.salesTax).toBeCloseTo(instant.profit.salesTax ?? 0, 6);
    expect(instant.profit.brokerFee).toBe(0);
    expect(order.profit.brokerFee).toBeGreaterThan(0);
    expect(order.profit.profit).toBeLessThan(instant.profit.profit!);
  });

  it("nets a blueprint offer's fees once, agreeing with the plain-item path on an equivalent offer", () => {
    // Regression for the double-netting trap: `buildVsBuy` nets its own sales
    // tax and broker fee into `build.profit`, which the blueprint path must
    // never inherit. Fold the blueprint's build cost into a plain item's ISK
    // sticker price and the two paths must reach the same profit.
    const [blueprintRow] = computeLoyaltyOfferRows({
      offers: [astero],
      catalog: makeCatalog(),
      hubPrices: { [TRITANIUM_ID]: 5, [ASTERO_ID]: 26_000_000 },
      adjustedPrices: { [TRITANIUM_ID]: 4 },
      systemCostIndex: 0.05,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });
    const buildCost = blueprintRow.build!.materialCost + blueprintRow.build!.jobFee.total;
    const equivalentItem: LoyaltyStoreOffer = {
      isk_cost: astero.isk_cost + buildCost,
      lp_cost: astero.lp_cost,
      offer_id: 9,
      quantity: 1,
      required_items: [],
      type_id: PROBE_ID,
    };
    const [itemRow] = computeLoyaltyOfferRows({
      offers: [equivalentItem],
      catalog: makeCatalog(),
      hubPrices: { [PROBE_ID]: 26_000_000 },
      adjustedPrices: {},
      systemCostIndex: 0,
      skills: {},
      liquidationBasis: 'order',
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(blueprintRow.profit.brokerFee).toBeCloseTo(itemRow.profit.brokerFee ?? 0, 6);
    expect(blueprintRow.profit.profit).toBeCloseTo(itemRow.profit.profit!, 6);
    expect(blueprintRow.profit.iskPerLp).toBeCloseTo(itemRow.profit.iskPerLp!, 9);
  });

  describe('required items (issue #1068)', () => {
    const TAG_ID = 40_000;
    const GOLD_TAG_ID = 40_001;

    const offerWithTurnIn: LoyaltyStoreOffer = {
      isk_cost: 0,
      lp_cost: 18_000,
      offer_id: 10,
      quantity: 1,
      required_items: [
        { type_id: TAG_ID, quantity: 8 },
        { type_id: GOLD_TAG_ID, quantity: 1 },
      ],
      type_id: PROBE_ID,
    };

    it('has no required items, and a required-items cost of 0, for an offer with none', () => {
      const [row] = computeLoyaltyOfferRows({
        offers: [probes],
        catalog: makeCatalog(),
        hubPrices: { [PROBE_ID]: 1_800 },
        adjustedPrices: {},
        systemCostIndex: 0,
        skills: {},
        liquidationBasis: 'order',
        materialSourcing: undefined,
        playerLp: 1_000_000,
      });

      expect(row.requiredItems).toEqual([]);
      expect(row.requiredItemsCost).toBe(0);
    });

    it('names, quantifies and prices each required item, from `itemNames` first', () => {
      const [row] = computeLoyaltyOfferRows({
        offers: [offerWithTurnIn],
        catalog: makeCatalog(),
        hubPrices: { [PROBE_ID]: 1_800, [TAG_ID]: 200_000, [GOLD_TAG_ID]: 30_000_000 },
        adjustedPrices: {},
        systemCostIndex: 0,
        skills: {},
        liquidationBasis: 'order',
        materialSourcing: undefined,
        itemNames: new Map([
          [TAG_ID, 'Serpentis Palladium Tag'],
          [GOLD_TAG_ID, 'Shadow Serpentis Gold Tag'],
        ]),
        playerLp: 1_000_000,
      });

      expect(row.requiredItems).toEqual([
        { typeId: TAG_ID, name: 'Serpentis Palladium Tag', quantity: 8, unitPrice: 200_000 },
        {
          typeId: GOLD_TAG_ID,
          name: 'Shadow Serpentis Gold Tag',
          quantity: 1,
          unitPrice: 30_000_000,
        },
      ]);
      const expectedCost = 8 * 200_000 + 1 * 30_000_000;
      expect(row.requiredItemsCost).toBe(expectedCost);
      // The exact figure already subtracted from profit — no independent
      // recomputation to drift from `loyaltyOfferProfit`'s own arithmetic.
      // offerWithTurnIn.quantity is 1, unlike the `probes` fixture.
      const revenue = 1 * 1_800;
      expect(row.profit.profit).toBeCloseTo(
        revenue - salesTax(revenue, 0) - brokerFee(revenue, 0) - expectedCost,
        6
      );
    });

    it('falls back to `nameForType` (then `#typeId`) for a required item absent from `itemNames`', () => {
      const [row] = computeLoyaltyOfferRows({
        offers: [offerWithTurnIn],
        catalog: makeCatalog(),
        hubPrices: {},
        adjustedPrices: {},
        systemCostIndex: 0,
        skills: {},
        liquidationBasis: 'order',
        materialSourcing: undefined,
        itemNames: new Map(),
        playerLp: 1_000_000,
      });

      expect(row.requiredItems[0].name).toBe(`#${TAG_ID}`);
    });

    it('lists an unpriced required item with a null unitPrice, and nulls the total, without dropping the other lines', () => {
      const [row] = computeLoyaltyOfferRows({
        offers: [offerWithTurnIn],
        catalog: makeCatalog(),
        hubPrices: { [PROBE_ID]: 1_800, [GOLD_TAG_ID]: 30_000_000 }, // TAG_ID unpriced
        adjustedPrices: {},
        systemCostIndex: 0,
        skills: {},
        liquidationBasis: 'order',
        materialSourcing: undefined,
        itemNames: new Map(),
        playerLp: 1_000_000,
      });

      expect(row.requiredItems).toHaveLength(2);
      expect(row.requiredItems.find((r) => r.typeId === TAG_ID)?.unitPrice).toBeNull();
      expect(row.requiredItems.find((r) => r.typeId === GOLD_TAG_ID)?.unitPrice).toBe(30_000_000);
      expect(row.requiredItemsCost).toBeNull();
      expect(row.profit.profit).toBeNull();
    });
  });

  describe('collectNameableTypeIds (issue #1068)', () => {
    it('includes every offer type_id plus every required_items type_id, deduplicated', () => {
      const a: LoyaltyStoreOffer = {
        isk_cost: 0,
        lp_cost: 1,
        offer_id: 1,
        quantity: 1,
        required_items: [
          { type_id: 40_000, quantity: 8 },
          { type_id: PROBE_ID, quantity: 1 }, // also an offer's own type_id elsewhere
        ],
        type_id: ASTERO_BP_ID,
      };
      const b: LoyaltyStoreOffer = {
        isk_cost: 0,
        lp_cost: 1,
        offer_id: 2,
        quantity: 1,
        required_items: [],
        type_id: PROBE_ID,
      };

      expect(new Set(collectNameableTypeIds([a, b]))).toEqual(
        new Set([ASTERO_BP_ID, 40_000, PROBE_ID])
      );
    });

    it('returns an empty array for no offers', () => {
      expect(collectNameableTypeIds([])).toEqual([]);
    });
  });
});
