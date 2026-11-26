import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { openSideLabel } from './priceHistoryLabels';

export interface PriceHistoryTableRow extends Partial<Omit<MarketHistoryPoint, 'date'>> {
  date: string;
  comparison?: Readonly<Record<number, number>>;
  buy?: Readonly<Record<number, number>>;
  sell?: Readonly<Record<number, number>>;
}

export interface ComparedRegionLabel {
  regionId: number;
  name: string;
  open?: boolean;
}

export interface OpenRegionLabel {
  regionId: number;
  name?: string;
}

export function priceHistoryCsvColumns(
  t: CsvTranslate,
  compared: readonly ComparedRegionLabel[] = [],
  openRegions: readonly OpenRegionLabel[] = []
): CsvColumn<PriceHistoryTableRow>[] {
  return [
    { header: t('market.priceHistory.date'), value: (p) => `${p.date}T00:00:00Z` },
    { header: t('market.priceHistory.average'), value: (p) => p.average },
    ...openRegions.flatMap(({ regionId, name }): CsvColumn<PriceHistoryTableRow>[] => [
      { header: openSideLabel(t, 'buy', name), value: (p) => p.buy?.[regionId] },
      { header: openSideLabel(t, 'sell', name), value: (p) => p.sell?.[regionId] },
    ]),
    { header: t('market.priceHistory.summaryLo'), value: (p) => p.lowest },
    { header: t('market.priceHistory.summaryHi'), value: (p) => p.highest },
    { header: t('market.priceHistory.volume'), value: (p) => p.volume },
    { header: t('market.priceHistory.orderCount'), value: (p) => p.orderCount },
    ...compared
      .filter((c) => !c.open)
      .map(({ regionId, name }): CsvColumn<PriceHistoryTableRow> => ({
        header: t('market.priceHistory.regionAverageColumn', { region: name }),
        value: (p) => p.comparison?.[regionId],
      })),
  ];
}
