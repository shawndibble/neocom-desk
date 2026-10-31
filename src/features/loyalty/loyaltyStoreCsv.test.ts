import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { loyaltyOfferCsvColumns, loyaltyOfferMaterialsCsvColumns } from './loyaltyStoreCsv';

const t = (k: string) => k;

function offer(
  profit: number | null,
  iskPerLp: number | null,
  sellsPerDay: number | null = 12.5
): LoyaltyOfferRow {
  return {
    offer: { offer_id: 1, type_id: 2, quantity: 1, lp_cost: 12500, isk_cost: 5000000 },
    itemName: 'Mid-grade Amulet Alpha',
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit: { profit, iskPerLp, affordableLp: true },
    sellsPerDay,
    requiredItems: [],
    requiredItemsCost: 0,
  } as unknown as LoyaltyOfferRow;
}

describe('loyaltyOfferCsvColumns', () => {
  it('exports item, the store cost split into LP and ISK, profit and ISK/LP', () => {
    const columns = loyaltyOfferCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'loyaltyStore.colItem',
      'loyaltyStore.csvBlueprint',
      'loyaltyStore.csvProduct',
      'loyaltyStore.csvLpCost',
      'loyaltyStore.csvIskCost',
      'loyaltyStore.colSellsPerDay',
      'loyaltyStore.colProfit',
      'loyaltyStore.colIskPerLp',
      'loyaltyStore.colIskPerConcordLp',
    ]);
    expect(columns.map((c) => c.value(offer(7500000.5, 1234.56)))).toEqual([
      'Mid-grade Amulet Alpha',
      'common.exportFlagNo',
      null,
      12500,
      5000000,
      12.5,
      7500000.5,
      1234.56,
      null,
    ]);
  });

  it('blanks profit and ISK/LP for an offer that cannot be priced', () => {
    const csv = toCsv([offer(null, null)], loyaltyOfferCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe(
      '"Mid-grade Amulet Alpha","common.exportFlagNo",,12500,5000000,12.5,,,'
    );
  });
});

describe('loyaltyOfferCsvColumns CONCORD basis and blueprints', () => {
  it('exports ISK per CONCORD LP at the rate, beside the plain ISK/LP', () => {
    const columns = loyaltyOfferCsvColumns(t, 0.5);
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(offer(1, 1000))]));
    expect(values['loyaltyStore.colIskPerLp']).toBe(1000);
    expect(values['loyaltyStore.colIskPerConcordLp']).toBe(500);
  });

  it('flags a blueprint offer and names its product', () => {
    const row = {
      ...offer(1, 1),
      isBlueprint: true,
      productName: 'Vexor',
    } as LoyaltyOfferRow;
    const values = Object.fromEntries(
      loyaltyOfferCsvColumns(t).map((c) => [c.header, c.value(row)])
    );
    expect(values['loyaltyStore.csvBlueprint']).toBe('common.exportFlagYes');
    expect(values['loyaltyStore.csvProduct']).toBe('Vexor');
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
