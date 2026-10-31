import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { iskPerConcordLp } from '@/engine/loyalty/concordExchange';
import { exportFlag } from '@/lib/exportFlag';

/**
 * Export columns for the LP Store offers list — every column the table can
 * show, whatever the ColumnPicker hides (the Market order book's precedent).
 * The item cell's "LP + ISK" caption splits into two numeric columns so a
 * spreadsheet can sort and divide by them. An offer that can't be priced
 * exports blank profit/ISK-per-LP, not the table's dash.
 */
export function loyaltyOfferCsvColumns(
  t: CsvTranslate,
  /**
   * The corporation's CONCORD LP exchange rate, or `null` (none, or still
   * loading). The screen shows ISK per CONCORD LP instead of ISK per LP when
   * the pilot picked that basis, so both are exported, as separate columns;
   * the CONCORD one is blank without a rate, as the screen shows no figure.
   */
  concordRate: number | null = null
): CsvColumn<LoyaltyOfferRow>[] {
  return [
    { header: t('loyaltyStore.colItem'), value: (row) => row.itemName },
    { header: t('loyaltyStore.csvBlueprint'), value: (row) => exportFlag(t, row.isBlueprint) },
    { header: t('loyaltyStore.csvProduct'), value: (row) => row.productName },
    { header: t('loyaltyStore.csvLpCost'), value: (row) => row.offer.lp_cost },
    { header: t('loyaltyStore.csvIskCost'), value: (row) => row.offer.isk_cost },
    { header: t('loyaltyStore.colSellsPerDay'), value: (row) => row.sellsPerDay },
    { header: t('loyaltyStore.colProfit'), value: (row) => row.profit.profit },
    { header: t('loyaltyStore.colIskPerLp'), value: (row) => row.profit.iskPerLp },
    {
      header: t('loyaltyStore.colIskPerConcordLp'),
      value: (row) =>
        concordRate === null ? null : iskPerConcordLp(row.profit.iskPerLp, concordRate),
    },
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
