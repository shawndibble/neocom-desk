import type { TFunction } from 'i18next';

/**
 * What the two fee columns assume. The same column means different things on
 * the Sell and Buy tables (a listing of your own at that price vs a sale into
 * it now), so the explanation is per side — on the header, and again in the
 * expanded row, where an unticked column is first met.
 */
export function feeColumnTooltip(
  t: TFunction,
  id: 'fees' | 'finalPrice',
  side: 'sell' | 'buy'
): string {
  if (id === 'fees') {
    return side === 'sell' ? t('market.feesTooltip.sell') : t('market.feesTooltip.buy');
  }
  return side === 'sell' ? t('market.finalPriceTooltip.sell') : t('market.finalPriceTooltip.buy');
}
