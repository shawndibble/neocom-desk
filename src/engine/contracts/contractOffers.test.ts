import { describe, it, expect } from 'vitest';
import {
  bpcRowsFromContractOffers,
  type PublicContractOfferRow,
} from '@/engine/contracts/contractOffers';

const base: PublicContractOfferRow = {
  contractId: 1,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 32858,
  price: 5000000,
  isAuction: false,
  quantity: 1,
  dateExpired: Date.parse('2026-09-09T18:00:00Z'),
};

const copy: PublicContractOfferRow = { ...base, isBlueprintCopy: true, me: 10, te: 18, runs: 3 };

describe('bpcRowsFromContractOffers', () => {
  it('keeps only blueprint copies, dropping every other item type', () => {
    const plainItem: PublicContractOfferRow = { ...base, typeId: 34, quantity: 250 };
    const blueprintOriginal: PublicContractOfferRow = { ...base, me: 10, te: 20 };

    expect(
      bpcRowsFromContractOffers([plainItem, copy, blueprintOriginal]).map((row) => row.typeId)
    ).toEqual([32858]);
  });

  it('carries the contract, location, pricing and blueprint detail through unchanged', () => {
    expect(bpcRowsFromContractOffers([copy])).toEqual([
      {
        contractId: 1,
        regionId: 10000002,
        locationId: 60003760,
        typeId: 32858,
        price: 5000000,
        isAuction: false,
        me: 10,
        te: 18,
        runs: 3,
        quantity: 1,
        dateExpired: Date.parse('2026-09-09T18:00:00Z'),
      },
    ]);
  });

  it('carries buyout only when the offer has one', () => {
    expect(bpcRowsFromContractOffers([copy])[0].buyout).toBeUndefined();
    expect(bpcRowsFromContractOffers([{ ...copy, buyout: 9000000 }])[0].buyout).toBe(9000000);
  });

  it('reads an absent ME/TE/runs as zero, the way the blank CSV column used to convert', () => {
    expect(bpcRowsFromContractOffers([{ ...base, isBlueprintCopy: true }])[0]).toMatchObject({
      me: 0,
      te: 0,
      runs: 0,
    });
  });

  it('is empty given no offers', () => {
    expect(bpcRowsFromContractOffers([])).toEqual([]);
  });
});
