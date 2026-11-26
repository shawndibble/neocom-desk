import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { iskPerConcordLp } from '@/engine/loyalty/concordExchange';
import { exportFlag } from '@/lib/exportFlag';

export function loyaltyOfferCsvColumns(
  t: CsvTranslate,
  {
    concordRate = null,
  }: {
    concordRate?: number | null;
  } = {}
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
