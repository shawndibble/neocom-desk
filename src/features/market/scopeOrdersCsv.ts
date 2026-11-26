import type { CsvColumn, CsvTranslate } from '@/lib/csv';

export interface ScopeOrderCsvRow {
  scope: string;
  seller: string;
  price: number | null;
  gapIsk: number | null;
  gapPct: number | null;
  ordersBeatingMe: number | null;
  unitsBeatingMe: number | null;
  distance: string | null;
}

export function scopeOrdersCsvColumns(t: CsvTranslate): CsvColumn<ScopeOrderCsvRow>[] {
  return [
    { header: t('market.orders.scopeColumn'), value: (row) => row.scope },
    { header: t('market.orders.scopeCheapestSeller'), value: (row) => row.seller },
    { header: t('market.orders.scopeTheirPrice'), value: (row) => row.price },
    { header: t('market.orders.scopeOverBy'), value: (row) => row.gapIsk },
    { header: t('market.orders.scopeOverByPct'), value: (row) => row.gapPct },
    { header: t('market.orders.scopeOrdersBeating'), value: (row) => row.ordersBeatingMe },
    { header: t('market.orders.scopeUnitsBeating'), value: (row) => row.unitsBeatingMe },
    { header: t('market.orders.scopeDistance'), value: (row) => row.distance },
  ];
}
