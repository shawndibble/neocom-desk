/**
 * Labels shared by the Price History chart, its table and its CSV, so a column
 * header, a tooltip row and an export header cannot drift apart. Literal i18n
 * keys, not template strings, so unused-key tooling still sees them.
 */
import type { OpenPriceSide, PriceSeriesChoice } from '@/engine/market/priceHistoryOpen';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "Domain buy" once regions are compared; plain "Buy" otherwise. */
export function openSideLabel(t: Translate, side: OpenPriceSide, region?: string): string {
  if (region) {
    return side === 'buy'
      ? t('market.priceHistory.regionBuy', { region })
      : t('market.priceHistory.regionSell', { region });
  }
  return side === 'buy' ? t('market.priceHistory.openBuy') : t('market.priceHistory.openSell');
}

/** The Lines select's option text. */
export function seriesChoiceLabel(t: Translate, choice: PriceSeriesChoice): string {
  if (choice === 'buy') return t('market.priceHistory.seriesBuy');
  if (choice === 'sell') return t('market.priceHistory.seriesSell');
  if (choice === 'average') return t('market.priceHistory.seriesAverage');
  return t('market.priceHistory.seriesBoth');
}
