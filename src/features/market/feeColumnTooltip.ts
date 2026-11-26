import type { TFunction } from 'i18next';

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
