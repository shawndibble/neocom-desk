import type { TFunction } from 'i18next';

export function priceSourceLabel(t: TFunction, hubName: string, buybackPct: number | null): string {
  return buybackPct === null
    ? t('piPlan.priceSource.market', { hub: hubName })
    : t('piPlan.priceSource.buyback');
}
