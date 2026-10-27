import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { MarketWideTreeEntry } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from './facilityDefaults';

vi.mock('@/sde/loadSde', () => ({ loadPi: vi.fn(() => Promise.resolve(null)) }));
vi.mock('./facilityDefaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./facilityDefaults')>()),
  loadActivityFacilityDefaults: vi.fn(),
}));
vi.mock('./buildPlanPricingInputs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./buildPlanPricingInputs')>()),
  loadBpcContractRows: vi.fn(),
}));
vi.mock('./blueprintPurchaseOffers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./blueprintPurchaseOffers')>()),
  loadBlueprintPurchaseOffers: vi.fn(),
}));
vi.mock('./inventionSources', () => ({ loadInventionMarket: vi.fn(() => Promise.resolve(null)) }));
vi.mock('./marketData', () => ({ loadMarketSnapshot: vi.fn() }));
vi.mock('./buildPlanStore', () => ({ loadLatestBuildPlan: vi.fn() }));

import { loadLatestBuildPlan } from './buildPlanStore';
import { loadBlueprintPurchaseOffers, type BlueprintOffersLookup } from './blueprintPurchaseOffers';
import { loadBpcContractRows } from './buildPlanPricingInputs';
import { loadActivityFacilityDefaults } from './facilityDefaults';
import { loadMarketSnapshot } from './marketData';
import { priceCandidatesAsPlans, type MarketWidePlanCandidate } from './marketWidePlanPricing';

const PRODUCT = 900;
const BLUEPRINT = 901;
const TRITANIUM = 34;

const TREE: MarketWideTreeEntry = {
  blueprintTypeID: BLUEPRINT,
  time: 3600,
  outputQuantity: 1,
  marketGroupID: 1,
  materials: [{ typeID: TRITANIUM, quantity: 100 }],
};
const BLUEPRINT_TYPE = {
  name: 'Widget Blueprint',
  time: 3600,
  materials: [{ typeID: TRITANIUM, quantity: 100 }],
  products: [{ typeID: PRODUCT, quantity: 1 }],
  skills: [],
  activity: 'manufacturing' as const,
};
const ENTRY = {
  blueprintTypeID: BLUEPRINT,
  blueprint: BLUEPRINT_TYPE,
  productTypeID: PRODUCT,
  productName: 'Widget',
  productNameLower: 'widget',
};
const CATALOG: BlueprintCatalog = {
  entries: [ENTRY],
  byBlueprintTypeID: new Map([[BLUEPRINT, ENTRY]]),
  byProductTypeID: new Map([[PRODUCT, ENTRY]]),
  typesById: {},
};

const candidate = (overrides: Partial<MarketWidePlanCandidate> = {}): MarketWidePlanCandidate => ({
  productTypeID: PRODUCT,
  tree: TREE,
  sellPrice: 1_000_000,
  sellDepthIsk: 50_000_000,
  me: 0,
  te: 0,
  ...overrides,
});

const context = {
  hub: DEFAULT_TRADE_HUB,
  catalog: CATALOG,
  modifiers: NO_CHARACTER_MODIFIERS,
  characterId: 7,
};

/** A blueprint original on sale at `price`, the way `loadBlueprintPurchaseOffers` reports one. */
function offerAt(price: number): BlueprintOffersLookup {
  return (blueprintTypeID: number): readonly BpcOffer[] =>
    blueprintTypeID === BLUEPRINT ? [{ me: 0, te: 0, runs: -1, quantity: 1, price }] : [];
}

const OWNED_ORIGINAL = {
  type_id: BLUEPRINT,
  runs: -1,
  material_efficiency: 0,
  time_efficiency: 0,
} as CharacterBlueprint;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadActivityFacilityDefaults).mockResolvedValue(DEFAULT_ACTIVITY_FACILITY_DEFAULTS);
  vi.mocked(loadBpcContractRows).mockResolvedValue([]);
  vi.mocked(loadLatestBuildPlan).mockResolvedValue(null);
  // The blueprint is on sale by default, so a candidate prices.
  vi.mocked(loadBlueprintPurchaseOffers).mockResolvedValue(offerAt(400_000));
  vi.mocked(loadMarketSnapshot).mockResolvedValue({
    hubPrices: { [PRODUCT]: 1_000_000, [TRITANIUM]: 5 },
    hubBuyPrices: {},
    hubSellVolumes: {},
    adjustedPrices: {},
    systemCostIndex: 0,
  } as unknown as Awaited<ReturnType<typeof loadMarketSnapshot>>);
});

describe('priceCandidatesAsPlans', () => {
  it('prices the blueprint itself: a bought original comes off profit and lifts build cost', async () => {
    // The pilot holds it, so a plan prices it free.
    const [free] = await priceCandidatesAsPlans([candidate()], {
      ...context,
      research: { owned: [OWNED_ORIGINAL], assumedMe: 0, assumedTe: 0 },
    });
    // Not held: the 400K original on sale is the plan's blueprint price.
    const [bought] = await priceCandidatesAsPlans([candidate()], context);

    expect(free).toBeDefined();
    expect(free!.profit - bought!.profit).toBe(400_000);
    expect(bought!.buildCost - free!.buildCost).toBe(400_000);
    expect(bought!.marginPct!).toBeLessThan(free!.marginPct!);
  });

  it('shows a loss, not a margin, when the blueprint costs more than the product earns', async () => {
    vi.mocked(loadBlueprintPurchaseOffers).mockResolvedValue(offerAt(134_600_000));
    const [row] = await priceCandidatesAsPlans([candidate()], context);
    expect(row!.profit).toBeLessThan(0);
    expect(row!.marginPct!).toBeLessThan(0);
    expect(row!.iskPerHour).toBeLessThan(0);
  });

  it('leaves out a candidate whose blueprint nothing prices, as a plan reads it as unpriced', async () => {
    vi.mocked(loadBlueprintPurchaseOffers).mockResolvedValue(() => []);
    expect(await priceCandidatesAsPlans([candidate()], context)).toEqual([]);
  });

  it("carries the row's seeded ME/TE, one run's output and the order depth", async () => {
    const [row] = await priceCandidatesAsPlans(
      [candidate({ me: 8, te: 14, sellDepthIsk: 123 })],
      context
    );
    expect(row).toMatchObject({
      productTypeID: PRODUCT,
      me: 8,
      te: 14,
      outputQuantity: 1,
      sellDepthIsk: 123,
    });
  });

  it('prices at the product price the scan chose, e.g. a troll order capped to the average', async () => {
    const [real] = await priceCandidatesAsPlans([candidate({ sellPrice: 1_000_000 })], context);
    const [capped] = await priceCandidatesAsPlans([candidate({ sellPrice: 500_000 })], context);
    expect(capped!.profit).toBeLessThan(real!.profit);
  });

  it('prices with the latest plan’s settings: its material price basis, as the plan page does', async () => {
    vi.mocked(loadMarketSnapshot).mockResolvedValue({
      hubPrices: { [PRODUCT]: 1_000_000, [TRITANIUM]: 500 },
      hubBuyPrices: { [PRODUCT]: 900_000, [TRITANIUM]: 300 },
      hubSellVolumes: {},
      adjustedPrices: {},
      systemCostIndex: 0,
    } as unknown as Awaited<ReturnType<typeof loadMarketSnapshot>>);
    const [sell] = await priceCandidatesAsPlans([candidate()], context);
    vi.mocked(loadLatestBuildPlan).mockResolvedValue({
      materialPriceBasis: 'buy',
      facility: 'npcStation',
      hubId: 'jita',
    } as unknown as Awaited<ReturnType<typeof loadLatestBuildPlan>>);
    const [buy] = await priceCandidatesAsPlans([candidate()], context);
    // 100 Tritanium at 300 against 500.
    expect(buy!.profit - sell!.profit).toBe(100 * (500 - 300));
  });

  it('leaves out a candidate whose material has no price rather than guessing', async () => {
    vi.mocked(loadMarketSnapshot).mockResolvedValue({
      hubPrices: { [PRODUCT]: 1_000_000 },
      hubBuyPrices: {},
      hubSellVolumes: {},
      adjustedPrices: {},
      systemCostIndex: 0,
    } as unknown as Awaited<ReturnType<typeof loadMarketSnapshot>>);
    expect(await priceCandidatesAsPlans([candidate()], context)).toEqual([]);
  });

  it('reads every price, offer and contract once for the whole scan', async () => {
    await priceCandidatesAsPlans([candidate(), candidate()], context);
    expect(loadMarketSnapshot).toHaveBeenCalledOnce();
    expect(loadBlueprintPurchaseOffers).toHaveBeenCalledOnce();
    expect(loadBpcContractRows).toHaveBeenCalledOnce();
  });
});
