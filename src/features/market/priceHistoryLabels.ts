/**
 * Labels for the Price History chart, its table and its CSV. The table and the
 * CSV share one helper so a column header and an export header cannot drift
 * apart; the chart's legend and tooltip share another, which says what the
 * line is (the best order still listed at close) because it is drawn beside
 * the traded range and can sit outside it. Literal i18n keys, not template
 * strings, so unused-key tooling still sees them.
 */
import type { OpenPriceSide, PriceSeriesChoice } from '@/engine/market/priceHistoryOpen';
import type { Translate } from '@/lib/translate';

export type { Translate } from '@/lib/translate';

/** Table and CSV header: "Domain buy" once places are compared; plain "Buy" otherwise. */
export function openSideLabel(t: Translate, side: OpenPriceSide, place?: string): string {
  if (place) {
    return side === 'buy'
      ? t('market.priceHistory.regionBuy', { region: place })
      : t('market.priceHistory.regionSell', { region: place });
  }
  return side === 'buy' ? t('market.priceHistory.openBuy') : t('market.priceHistory.openSell');
}

/**
 * Chart legend and tooltip: "Jita 4-4 buy at close" with a station or region;
 * "Best buy at close" otherwise.
 */
export function chartOpenSideLabel(t: Translate, side: OpenPriceSide, place?: string): string {
  if (place) {
    return side === 'buy'
      ? t('market.priceHistory.regionBuyAtClose', { region: place })
      : t('market.priceHistory.regionSellAtClose', { region: place });
  }
  return side === 'buy'
    ? t('market.priceHistory.openBuyAtClose')
    : t('market.priceHistory.openSellAtClose');
}

/** The Lines select's option text. */
export function seriesChoiceLabel(t: Translate, choice: PriceSeriesChoice): string {
  if (choice === 'buy') return t('market.priceHistory.seriesBuy');
  if (choice === 'sell') return t('market.priceHistory.seriesSell');
  if (choice === 'average') return t('market.priceHistory.seriesAverage');
  return t('market.priceHistory.seriesBoth');
}
