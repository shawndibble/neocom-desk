import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { db } from '@/db';
import { loadGlobalMarketOverrides } from '@/features/market/orderBookView';
import { findLpOfferMatches } from '@/features/market/appraisalLpAcquisition';
import { loadMarketLpValues } from '@/features/loyalty/marketLpValue';
import { loadOwnedStockSnapshot } from './ownedStockDetection';
import {
  blueprintTypeIdsIn,
  loadBlueprintPurchaseOffers,
  lpBlueprintPickPrice,
} from './blueprintPurchaseOffers';

vi.mock('@/market/prices', () => ({ getHubPrices: vi.fn(), getRegionSellPrices: vi.fn() }));
vi.mock('@/features/market/orderBookView', () => ({ loadGlobalMarketOverrides: vi.fn() }));
vi.mock('@/db', () => ({ db: { characters: { toArray: vi.fn() } } }));
vi.mock('@/features/market/appraisalLpAcquisition', () => ({ findLpOfferMatches: vi.fn() }));
vi.mock('./ownedStockDetection', () => ({
  EMPTY_OWNED_STOCK_SNAPSHOT: { sources: [], characterNames: new Map(), incompleteCharacters: [] },
  loadOwnedStockSnapshot: vi.fn(),
}));
const lpValueState = vi.hoisted(() => ({ value: 0, hydrate: async () => {} }));
vi.mock('@/features/loyalty/lpValue', () => ({ useLpValue: { getState: () => lpValueState } }));
vi.mock('@/features/loyalty/marketLpValue', () => ({ loadMarketLpValues: vi.fn() }));

const JITA = getTradeHub('jita')!;
const BLUEPRINT = 900;
const HULL = 34;

function lpMatch(requiredQuantity: number) {
  return {
    matchesByTypeId: new Map([
      [
        BLUEPRINT,
        [
          {
            corporationId: 1,
            corpName: 'Corp',
            playerLp: 1_000,
            offer: {
              offer_id: 1,
              type_id: BLUEPRINT,
              quantity: 1,
              isk_cost: 1_000,
              lp_cost: 500,
              ak_cost: 0,
              required_items:
                requiredQuantity > 0 ? [{ type_id: HULL, quantity: requiredQuantity }] : [],
            },
          },
        ],
      ],
    ]),
    requiredItemTypeIds: requiredQuantity > 0 ? [HULL] : [],
  };
}

function ownedHulls(quantity: number) {
  return {
    sources: [
      {
        characterId: 7,
        assets: [
          {
            item_id: 1,
            type_id: HULL,
            quantity,
            location_id: 60003760,
            location_type: 'station',
            location_flag: 'Hangar',
            is_singleton: false,
          },
        ],
      },
    ],
    characterNames: new Map(),
    incompleteCharacters: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRegionSellPrices).mockResolvedValue(new Map([[BLUEPRINT, null]]));
  vi.mocked(getHubPrices).mockResolvedValue(
    new Map([[HULL, { sellMin: 200, buyMax: null, sellVolume: 1, buyVolume: 0 }]])
  );
  vi.mocked(findLpOfferMatches).mockResolvedValue(lpMatch(0) as never);
  vi.mocked(loadOwnedStockSnapshot).mockResolvedValue(ownedHulls(0) as never);
  vi.mocked(loadGlobalMarketOverrides).mockResolvedValue(new Map());
  vi.mocked(db.characters.toArray).mockResolvedValue([{ characterId: 7 }] as never);
  // Corp 1's LP sells for 4 ISK on the market.
  vi.mocked(loadMarketLpValues).mockResolvedValue(new Map([[1, 4]]));
  lpValueState.value = 0;
});

describe('loadBlueprintPurchaseOffers', () => {
  it('offers the region market sell as an ME0 original', async () => {
    vi.mocked(getRegionSellPrices).mockResolvedValue(new Map([[BLUEPRINT, 5_000]]));
    vi.mocked(findLpOfferMatches).mockResolvedValue({
      matchesByTypeId: new Map(),
      requiredItemTypeIds: [],
    });
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([{ me: 0, te: 0, runs: -1, quantity: 1, price: 5_000 }]);
  });

  it('prices an LP redemption at the store’s market LP Value when the pilot set none', async () => {
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    // 1,000 ISK + 500 LP at 4 ISK/LP.
    expect(offersFor(BLUEPRINT)).toEqual([{ me: 0, te: 0, runs: 1, quantity: 1, price: 3_000 }]);
  });

  it('uses the pilot’s own LP Value over the market’s', async () => {
    lpValueState.value = 10;
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([expect.objectContaining({ price: 6_000 })]);
  });

  it('leaves a redemption out when nothing prices its LP, rather than counting the LP free', async () => {
    vi.mocked(loadMarketLpValues).mockResolvedValue(new Map([[1, null]]));
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([]);
  });

  it('charges only the turn-ins the pilot does not already hold', async () => {
    vi.mocked(findLpOfferMatches).mockResolvedValue(lpMatch(3) as never);
    vi.mocked(loadOwnedStockSnapshot).mockResolvedValue(ownedHulls(2) as never);
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([expect.objectContaining({ price: 3_200 })]);
  });

  it("counts an alt's LP Store offers, once per distinct corp offer", async () => {
    vi.mocked(db.characters.toArray).mockResolvedValue([
      { characterId: 7 },
      { characterId: 8 },
    ] as never);
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(findLpOfferMatches).toHaveBeenCalledWith(8, [BLUEPRINT]);
    // Both Characters see the same corp offer — it is one offer, not two.
    expect(offersFor(BLUEPRINT)).toHaveLength(1);
  });

  it("reads a blueprint's Global Market Region instead of the hub's", async () => {
    vi.mocked(loadGlobalMarketOverrides).mockResolvedValue(
      new Map([[BLUEPRINT, { regionId: 10000001, regionName: 'Derelik' }]])
    );
    await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(getRegionSellPrices).toHaveBeenCalledWith(10000001, [BLUEPRINT]);
  });

  it('prices a zero-ISK redemption at its LP alone, not as no offer', async () => {
    vi.mocked(findLpOfferMatches).mockResolvedValue({
      ...lpMatch(0),
      matchesByTypeId: new Map([
        [
          BLUEPRINT,
          [
            {
              ...lpMatch(0).matchesByTypeId.get(BLUEPRINT)![0]!,
              offer: { ...lpMatch(0).matchesByTypeId.get(BLUEPRINT)![0]!.offer, isk_cost: 0 },
            },
          ],
        ],
      ]),
    } as never);
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([expect.objectContaining({ price: 2_000 })]);
  });
});

describe('lpBlueprintPickPrice', () => {
  it('prices one redemption with owned turn-ins free and the rest at the hub price', async () => {
    vi.mocked(loadOwnedStockSnapshot).mockResolvedValue(ownedHulls(1) as never);
    const offer = lpMatch(3).matchesByTypeId.get(BLUEPRINT)![0]!.offer;
    const price = await lpBlueprintPickPrice(offer as never, 1, JITA);
    expect(price).toBe(3_400);
  });

  it('is no price when a turn-in still to buy is unpriced', async () => {
    vi.mocked(getHubPrices).mockResolvedValue(new Map());
    const offer = lpMatch(1).matchesByTypeId.get(BLUEPRINT)![0]!.offer;
    const price = await lpBlueprintPickPrice(offer as never, 1, JITA);
    expect(price).toBeNull();
  });

  it('is no price when nothing prices the LP', async () => {
    vi.mocked(loadMarketLpValues).mockResolvedValue(new Map([[1, null]]));
    const offer = lpMatch(0).matchesByTypeId.get(BLUEPRINT)![0]!.offer;
    expect(await lpBlueprintPickPrice(offer as never, 1, JITA)).toBeNull();
  });
});

describe('blueprintTypeIdsIn', () => {
  it('keeps only the blueprint typeIDs of a mixed type list', () => {
    const catalog = { byBlueprintTypeID: new Map([[BLUEPRINT, {}]]) } as never;
    expect(blueprintTypeIdsIn([34, BLUEPRINT, 35], catalog)).toEqual([BLUEPRINT]);
  });
});
