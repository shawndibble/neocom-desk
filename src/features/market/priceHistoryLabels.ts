import type { OpenPriceSide, PriceSeriesChoice } from '@/engine/market/priceHistoryOpen';
import type { Translate } from '@/lib/translate';

export function openSideLabel(t: Translate, side: OpenPriceSide, place?: string): string {
  if (place) {
    return side === 'buy'
      ? t('market.priceHistory.regionBuy', { region: place })
      : t('market.priceHistory.regionSell', { region: place });
  }
  return side === 'buy' ? t('market.priceHistory.openBuy') : t('market.priceHistory.openSell');
}

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

export function seriesChoiceLabel(t: Translate, choice: PriceSeriesChoice): string {
  if (choice === 'buy') return t('market.priceHistory.seriesBuy');
  if (choice === 'sell') return t('market.priceHistory.seriesSell');
  if (choice === 'average') return t('market.priceHistory.seriesAverage');
  return t('market.priceHistory.seriesBoth');
}
