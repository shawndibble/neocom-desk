import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';

/**
 * Export columns for the LP Store offers list — every column the table can
 * show, whatever the ColumnPicker hides (the Market order book's precedent).
 * The item cell's "LP + ISK" caption splits into two numeric columns so a
 * spreadsheet can sort and divide by them. An offer that can't be priced
 * exports blank profit/ISK-per-LP, not the table's dash.
 */
export function loyaltyOfferCsvColumns(t: CsvTranslate): CsvColumn<LoyaltyOfferRow>[] {
  return [
    { header: t('loyaltyStore.colItem'), value: (row) => row.itemName },
    { header: t('loyaltyStore.csvLpCost'), value: (row) => row.offer.lp_cost },
    { header: t('loyaltyStore.csvIskCost'), value: (row) => row.offer.isk_cost },
    { header: t('loyaltyStore.colProfit'), value: (row) => row.profit.profit },
    { header: t('loyaltyStore.colIskPerLp'), value: (row) => row.profit.iskPerLp },
  ];
}

/** Export columns for one blueprint offer's materials table. */
export function loyaltyOfferMaterialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeId: number) => string
): CsvColumn<ResolvedMaterial>[] {
  return [
    { header: t('loyaltyStore.materialColName'), value: (material) => nameFor(material.typeID) },
    { header: t('loyaltyStore.materialColNeeded'), value: (material) => material.quantity },
    { header: t('loyaltyStore.materialColOwned'), value: (material) => material.ownedQuantity },
    { header: t('loyaltyStore.materialColBuyCost'), value: (material) => material.lineCost },
  ];
}
