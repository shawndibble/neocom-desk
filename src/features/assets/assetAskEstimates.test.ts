import { describe, expect, it, vi } from 'vitest';
import type { OfferIndex } from '@/features/contractSearch/publicContractOfferIndex';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadAssetAskEstimates } from './assetAskEstimates';

const index = {
  types: new Map([
    [1, { typeId: 1, count: 6, cheapest: 1 }],
    [2, { typeId: 2, count: 4, cheapest: 1 }],
  ]),
} as unknown as OfferIndex;
const row = (price: number, id: number): PublicContractOfferRow => ({
  contractId: id,
  regionId: 1,
  locationId: 1,
  typeId: 1,
  price,
  isAuction: false,
  quantity: 1,
  lineCount: 1,
  dateExpired: Date.now() + 60_000,
});

describe('loadAssetAskEstimates', () => {
  it('reads only types the index says have enough offers', async () => {
    const offers = vi.fn().mockResolvedValue([10, 20, 30, 40, 50, 60].map((p, i) => row(p, i)));
    const result = await loadAssetAskEstimates([1, 2, 3], { index: async () => index, offers });
    expect([...offers.mock.calls[0]![1]]).toEqual([1]);
    expect(result.get(1)).toMatchObject({ unitPrice: 35, contracts: 6 });
  });

  it('downloads nothing when no type has enough offers', async () => {
    const offers = vi.fn();
    expect((await loadAssetAskEstimates([2], { index: async () => index, offers })).size).toBe(0);
    expect(offers).not.toHaveBeenCalled();
  });

  it('is empty when the snapshot is unreachable or throws', async () => {
    const offers = vi.fn();
    expect((await loadAssetAskEstimates([1], { index: async () => null, offers })).size).toBe(0);
    const boom = async () => {
      throw new Error('x');
    };
    expect((await loadAssetAskEstimates([1], { index: boom, offers })).size).toBe(0);
  });
});
