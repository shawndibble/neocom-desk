import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { comparisonPct } from '@/engine/market/orderBookDepth';
import { versusSelf, type VariationRow } from './variations';

export function variationsCsvColumns(
  t: CsvTranslate,
  prices: ReadonlyMap<number, OrderBookSummary | undefined>,
  context: {
    selfName: string;
    selfSummary: OrderBookSummary | undefined;
    scopeName: string;
  }
): CsvColumn<VariationRow>[] {
  return [
    { header: t('market.variations.name'), value: (row) => row.name },
    { header: t('market.variations.tier'), value: (row) => row.tier },
    { header: t('market.variations.sell'), value: (row) => prices.get(row.typeId)?.bestSell },
    { header: t('market.variations.buy'), value: (row) => prices.get(row.typeId)?.bestBuy },
    {
      header: t('market.variations.versus', { name: context.selfName }),
      value: (row) => versusSelf(context.selfSummary, prices, row.typeId)?.delta ?? null,
    },
    {
      header: t('market.variations.versusPct', { name: context.selfName }),
      value: (row) => comparisonPct(versusSelf(context.selfSummary, prices, row.typeId)),
    },
    { header: t('market.variations.pricedAtColumn'), value: () => context.scopeName },
  ];
}
