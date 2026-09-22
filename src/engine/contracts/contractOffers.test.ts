import { describe, it, expect } from 'vitest';
import {
  bpcRowsFromContractOffers,
  bpoRowsFromContractOffers,
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
        isMultiType: false,
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

  describe('isMultiType (issue #1076)', () => {
    it('is false for a contract selling a single distinct type, however many lines/quantity it has', () => {
      // Two lines of the same typeId (different ME) is still one type.
      const secondLine: PublicContractOfferRow = { ...copy, me: 8, quantity: 2 };
      const rows = bpcRowsFromContractOffers([copy, secondLine]);
      expect(rows.every((row) => row.isMultiType === false)).toBe(true);
    });

    it('is true on every kept row when a contract carries more than one distinct type', () => {
      const otherBlueprint: PublicContractOfferRow = { ...copy, typeId: 32880 };
      const rows = bpcRowsFromContractOffers([copy, otherBlueprint]);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.isMultiType === true)).toBe(true);
    });

    it('counts every for-sale line toward the tally, not only blueprint copies', () => {
      // A contract selling one blueprint copy plus a plain module is still a
      // multi-type bundle, even though only the blueprint line survives the
      // filter — the plain module row is what makes the price indivisible.
      const plainModule: PublicContractOfferRow = { ...base, typeId: 34, quantity: 250 };
      const rows = bpcRowsFromContractOffers([copy, plainModule]);
      expect(rows).toEqual([expect.objectContaining({ typeId: 32858, isMultiType: true })]);
    });

    it('tallies per contract, not across the whole snapshot', () => {
      const otherContractCopy: PublicContractOfferRow = { ...copy, contractId: 2, typeId: 32880 };
      const rows = bpcRowsFromContractOffers([copy, otherContractCopy]);
      expect(rows).toEqual([
        expect.objectContaining({ contractId: 1, isMultiType: false }),
        expect.objectContaining({ contractId: 2, isMultiType: false }),
      ]);
    });
  });
});

describe('bpoRowsFromContractOffers', () => {
  const original: PublicContractOfferRow = { ...base, contractId: 2, me: 10, te: 20 };

  it('keeps only blueprint originals — unflagged lines that carry ME/TE', () => {
    const plainItem: PublicContractOfferRow = { ...base, typeId: 34, quantity: 250 };
    expect(
      bpoRowsFromContractOffers([plainItem, copy, original]).map((row) => row.contractId)
    ).toEqual([2]);
  });

  it('reports an original with the -1 unlimited-runs sentinel and its research', () => {
    expect(bpoRowsFromContractOffers([original])).toEqual([
      {
        contractId: 2,
        regionId: 10000002,
        locationId: 60003760,
        typeId: 32858,
        price: 5000000,
        isAuction: false,
        me: 10,
        te: 20,
        runs: -1,
        quantity: 1,
        dateExpired: Date.parse('2026-09-09T18:00:00Z'),
        isMultiType: false,
      },
    ]);
  });

  it('flags an original bundled with another for-sale type as multi-type', () => {
    const bundledItem: PublicContractOfferRow = { ...base, contractId: 2, typeId: 34 };
    expect(bpoRowsFromContractOffers([original, bundledItem])[0].isMultiType).toBe(true);
  });
});
