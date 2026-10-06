import type { TFunction } from 'i18next';

/**
 * The phrase for where a PI price comes from: the chosen hub's market, or the
 * corp buyback when that is where the pilot sells. Never hardcodes a hub.
 */
export function priceSourceLabel(t: TFunction, hubName: string, buybackPct: number | null): string {
  return buybackPct === null
    ? t('piPlan.priceSource.market', { hub: hubName })
    : t('piPlan.priceSource.buyback');
}
