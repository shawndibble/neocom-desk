import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { loyaltyOfferCsvColumns, loyaltyOfferMaterialsCsvColumns } from './loyaltyStoreCsv';

const t = (k: string) => k;

function offer(profit: number | null, iskPerLp: number | null): LoyaltyOfferRow {
  return {
    offer: { offer_id: 1, type_id: 2, quantity: 1, lp_cost: 12500, isk_cost: 5000000 },
    itemName: 'Mid-grade Amulet Alpha',
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit: { profit, iskPerLp, affordableLp: true },
    requiredItems: [],
    requiredItemsCost: 0,
  } as unknown as LoyaltyOfferRow;
}

describe('loyaltyOfferCsvColumns', () => {
  it('exports item, the store cost split into LP and ISK, profit and ISK/LP', () => {
    const columns = loyaltyOfferCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'loyaltyStore.colItem',
      'loyaltyStore.csvLpCost',
      'loyaltyStore.csvIskCost',
      'loyaltyStore.colProfit',
      'loyaltyStore.colIskPerLp',
    ]);
    expect(columns.map((c) => c.value(offer(7500000.5, 1234.56)))).toEqual([
      'Mid-grade Amulet Alpha',
      12500,
      5000000,
      7500000.5,
      1234.56,
    ]);
  });

  it('blanks profit and ISK/LP for an offer that cannot be priced', () => {
    const csv = toCsv([offer(null, null)], loyaltyOfferCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"Mid-grade Amulet Alpha",12500,5000000,,');
  });
});

describe('loyaltyOfferMaterialsCsvColumns', () => {
  it('exports material, needed, owned and buy cost raw, with the table header keys', () => {
    const columns = loyaltyOfferMaterialsCsvColumns(t, (typeId) => `Type ${typeId}`);
    expect(columns.map((c) => c.header)).toEqual([
      'loyaltyStore.materialColName',
      'loyaltyStore.materialColNeeded',
      'loyaltyStore.materialColOwned',
      'loyaltyStore.materialColBuyCost',
    ]);
    const material = {
      typeID: 34,
      quantity: 1200,
      ownedQuantity: 200,
      lineCost: 5500.25,
    } as unknown as ResolvedMaterial;
    expect(columns.map((c) => c.value(material))).toEqual(['Type 34', 1200, 200, 5500.25]);
  });
});
