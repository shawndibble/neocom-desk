import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { priceComparison } from '@/engine/market/orderBookDepth';
import type { VariationRow } from './variations';

/**
 * CSV columns for the Variations table: name, tier, best sell/buy, the best
 * sell's distance from the item the rows vary (ISK and %), and where priced. `sell`
 * and `buy` are raw numbers (`bestSell`/`bestBuy`), not `formatIsk` strings —
 * same convention as `orderBookCsvColumns`. A row whose price hasn't
 * resolved yet (absent from `prices`, or present but still loading) exports
 * as an empty cell rather than a loading placeholder string.
 */
export function variationsCsvColumns(
  t: CsvTranslate,
  prices: ReadonlyMap<number, OrderBookSummary | undefined>,
  /** What the table measures and labels its rows against: the item they vary, and where they are priced. */
  context: {
    selfName: string;
    selfSummary: OrderBookSummary | undefined;
    scopeName: string;
  }
): CsvColumn<VariationRow>[] {
  const versusSelf = (row: VariationRow) =>
    priceComparison(
      context.selfSummary?.bestSell ?? null,
      prices.get(row.typeId)?.bestSell ?? null
    );
  return [
    { header: t('market.variations.name'), value: (row) => row.name },
    { header: t('market.variations.tier'), value: (row) => row.tier },
    { header: t('market.variations.sell'), value: (row) => prices.get(row.typeId)?.bestSell },
    { header: t('market.variations.buy'), value: (row) => prices.get(row.typeId)?.bestBuy },
    {
      header: t('market.variations.versus', { name: context.selfName }),
      value: (row) => versusSelf(row)?.delta ?? null,
    },
    {
      header: t('market.variations.versusPct', { name: context.selfName }),
      value: (row) => {
        const ratio = versusSelf(row)?.ratio;
        return ratio === undefined ? null : ratio * 100;
      },
    },
    { header: t('market.variations.pricedAtColumn'), value: () => context.scopeName },
  ];
}
