import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { findLpOfferMatches } from '@/features/market/appraisalLpAcquisition';
import { loadOwnedStockSnapshot } from './ownedStockDetection';
import { blueprintTypeIdsIn, loadBlueprintPurchaseOffers } from './blueprintPurchaseOffers';

vi.mock('@/market/prices', () => ({ getHubPrices: vi.fn(), getRegionSellPrices: vi.fn() }));
vi.mock('@/features/market/appraisalLpAcquisition', () => ({ findLpOfferMatches: vi.fn() }));
vi.mock('./ownedStockDetection', () => ({
  EMPTY_OWNED_STOCK_SNAPSHOT: { sources: [], characterNames: new Map(), incompleteCharacters: [] },
  loadOwnedStockSnapshot: vi.fn(),
}));
vi.mock('@/features/loyalty/lpValue', () => {
  const state = { value: 0, hydrate: vi.fn(async () => {}) };
  return { useLpValue: { getState: () => state } };
});

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

  it('prices an LP redemption at its ISK cost when the LP Value is the default 0', async () => {
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([{ me: 0, te: 0, runs: 1, quantity: 1, price: 1_000 }]);
  });

  it('charges only the turn-ins the pilot does not already hold', async () => {
    vi.mocked(findLpOfferMatches).mockResolvedValue(lpMatch(3) as never);
    vi.mocked(loadOwnedStockSnapshot).mockResolvedValue(ownedHulls(2) as never);
    const offersFor = await loadBlueprintPurchaseOffers(7, JITA, [BLUEPRINT]);
    expect(offersFor(BLUEPRINT)).toEqual([expect.objectContaining({ price: 1_200 })]);
  });

  it('reads no LP Store without a Character', async () => {
    const offersFor = await loadBlueprintPurchaseOffers(null, JITA, [BLUEPRINT]);
    expect(findLpOfferMatches).not.toHaveBeenCalled();
    expect(offersFor(BLUEPRINT)).toEqual([]);
  });
});

describe('blueprintTypeIdsIn', () => {
  it('keeps only the blueprint typeIDs of a mixed type list', () => {
    const catalog = { byBlueprintTypeID: new Map([[BLUEPRINT, {}]]) } as never;
    expect(blueprintTypeIdsIn([34, BLUEPRINT, 35], catalog)).toEqual([BLUEPRINT]);
  });
});
