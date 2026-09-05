import { describe, it, expect } from 'vitest';
import { computeLoyaltyOfferRows } from '@/features/loyalty/offerRows';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';

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
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    expect(row.isBlueprint).toBe(false);
    expect(row.build).toBeNull();
    expect(row.itemName).toBe('Sisters Combat Scanner Probe');
    expect(row.profit.revenue).toBe(8 * 1_800);
    expect(row.profit.profit).toBe(8 * 1_800 - 96_000);
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
      materialSourcing: undefined,
      playerLp: 1_000_000,
    });

    // 1 run of the fixture's blueprint needs 1,000,000 Tritanium, not 3,000,000.
    expect(row.build!.materials[0].baseQuantity).toBe(1_000_000);
  });
});
