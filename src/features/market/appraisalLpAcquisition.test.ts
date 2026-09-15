import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StatusResult, CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints, LoyaltyStoreOffer } from '@/esi/endpoints';
import { PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { findLpOfferMatches, toLpOfferInputs } from './appraisalLpAcquisition';

vi.mock('@/features/character/loyalty', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/loyalty')>()),
  loadCharacterLoyaltyPoints: vi.fn(),
}));
vi.mock('@/features/loyalty/store', () => ({
  loadLoyaltyStoreOffers: vi.fn(),
  loadCorporationName: vi.fn(),
}));

const { loadCharacterLoyaltyPoints } = await import('@/features/character/loyalty');
const { loadLoyaltyStoreOffers, loadCorporationName } = await import('@/features/loyalty/store');

const mockedPoints = vi.mocked(loadCharacterLoyaltyPoints);
const mockedOffers = vi.mocked(loadLoyaltyStoreOffers);
const mockedCorpName = vi.mocked(loadCorporationName);

afterEach(() => vi.clearAllMocks());

function pointsResult(entries: CharacterLoyaltyPoints[]): StatusResult<CharacterLoyaltyPoints[]> {
  return {
    cached: { data: entries, fetchedAt: new Date(), fromCache: false, truncated: false },
    needsReauth: false,
  };
}

function offersResult(offers: LoyaltyStoreOffer[]): CachedResult<LoyaltyStoreOffer[]> {
  return { data: offers, fetchedAt: new Date(), fromCache: false, truncated: false };
}

const ASTERO_OFFER: LoyaltyStoreOffer = {
  offer_id: 1,
  type_id: 33468,
  quantity: 1,
  isk_cost: 850_000,
  lp_cost: 400_000,
  required_items: [],
};

describe('findLpOfferMatches', () => {
  it('is empty with no typeIds to search', async () => {
    const result = await findLpOfferMatches(1, []);
    expect(result.matchesByTypeId.size).toBe(0);
    expect(mockedPoints).not.toHaveBeenCalled();
  });

  it('is empty when the loyalty scope has no cached data', async () => {
    mockedPoints.mockResolvedValue({ cached: null, needsReauth: true });
    const result = await findLpOfferMatches(1, [33468]);
    expect(result.matchesByTypeId.size).toBe(0);
  });

  it('never queries a corp the character holds no LP with', async () => {
    mockedPoints.mockResolvedValue(pointsResult([{ corporation_id: 999, loyalty_points: 0 }]));
    await findLpOfferMatches(1, [33468]);
    expect(mockedOffers).not.toHaveBeenCalled();
  });

  it('skips Paragon (EverMarks) — it runs no LP store of its own', async () => {
    mockedPoints.mockResolvedValue(
      pointsResult([{ corporation_id: PARAGON_CORPORATION_ID, loyalty_points: 500_000 }])
    );
    await findLpOfferMatches(1, [33468]);
    expect(mockedOffers).not.toHaveBeenCalled();
  });

  it('matches an offer whose type_id is in the requested set', async () => {
    mockedPoints.mockResolvedValue(
      pointsResult([{ corporation_id: 1000125, loyalty_points: 500_000 }])
    );
    mockedOffers.mockResolvedValue(offersResult([ASTERO_OFFER]));
    mockedCorpName.mockResolvedValue('Sisters of EVE');

    const result = await findLpOfferMatches(1, [33468]);

    const matches = result.matchesByTypeId.get(33468);
    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toEqual({
      corpName: 'Sisters of EVE',
      offer: ASTERO_OFFER,
      playerLp: 500_000,
    });
  });

  it('collects required_items type ids across every match, deduplicated', async () => {
    const offerWithTurnIn: LoyaltyStoreOffer = {
      ...ASTERO_OFFER,
      required_items: [{ type_id: 44992, quantity: 10 }],
    };
    mockedPoints.mockResolvedValue(
      pointsResult([
        { corporation_id: 1000125, loyalty_points: 500_000 },
        { corporation_id: 1000126, loyalty_points: 500_000 },
      ])
    );
    mockedOffers.mockResolvedValue(offersResult([offerWithTurnIn]));
    mockedCorpName.mockResolvedValue('Some Corp');

    const result = await findLpOfferMatches(1, [33468]);

    expect(result.requiredItemTypeIds).toEqual([44992]);
  });

  it('falls back to a #corpId label when the corp name cannot be resolved', async () => {
    mockedPoints.mockResolvedValue(
      pointsResult([{ corporation_id: 1000125, loyalty_points: 500_000 }])
    );
    mockedOffers.mockResolvedValue(offersResult([ASTERO_OFFER]));
    mockedCorpName.mockResolvedValue(null);

    const result = await findLpOfferMatches(1, [33468]);

    expect(result.matchesByTypeId.get(33468)?.[0].corpName).toBe('#1000125');
  });

  it('never fetches a corp name when that corp sells nothing in the requested set', async () => {
    mockedPoints.mockResolvedValue(
      pointsResult([{ corporation_id: 1000125, loyalty_points: 500_000 }])
    );
    mockedOffers.mockResolvedValue(offersResult([{ ...ASTERO_OFFER, type_id: 999 }]));

    await findLpOfferMatches(1, [33468]);

    expect(mockedCorpName).not.toHaveBeenCalled();
  });
});

describe('toLpOfferInputs', () => {
  it("adapts a raw match into the engine's plain offer shape", () => {
    const inputs = toLpOfferInputs(
      [{ corpName: 'Sisters of EVE', offer: ASTERO_OFFER, playerLp: 500_000 }],
      new Map()
    );
    expect(inputs).toEqual([
      {
        corpName: 'Sisters of EVE',
        quantityPerRedemption: 1,
        lpCostPerRedemption: 400_000,
        iskCostPerRedemption: 850_000,
        requiredItemsCostPerRedemption: 0,
        playerLp: 500_000,
      },
    ]);
  });

  it('prices required_items at the given hub prices', () => {
    const offer: LoyaltyStoreOffer = {
      ...ASTERO_OFFER,
      required_items: [{ type_id: 44992, quantity: 10 }],
    };
    const inputs = toLpOfferInputs(
      [{ corpName: 'Sisters of EVE', offer, playerLp: 500_000 }],
      new Map([[44992, 100]])
    );
    expect(inputs[0].requiredItemsCostPerRedemption).toBe(1_000);
  });

  it('is unpriceable when any required item has no hub price', () => {
    const offer: LoyaltyStoreOffer = {
      ...ASTERO_OFFER,
      required_items: [{ type_id: 44992, quantity: 10 }],
    };
    const inputs = toLpOfferInputs(
      [{ corpName: 'Sisters of EVE', offer, playerLp: 500_000 }],
      new Map()
    );
    expect(inputs[0].requiredItemsCostPerRedemption).toBeNull();
  });
});
