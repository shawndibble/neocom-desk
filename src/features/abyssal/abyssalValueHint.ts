import { formatAge } from '@/lib/age';
import type { AbyssalEstimate } from '@/market/mutamarket';
import type { Translate } from '@/lib/translate';

/** When the estimate was made: MutaMarket's model run, else when this device fetched it. */
function estimatedAt(estimate: AbyssalEstimate): number {
  const modelRun = estimate.valueUpdatedAt ? Date.parse(estimate.valueUpdatedAt) : Number.NaN;
  return Number.isFinite(modelRun) ? modelRun : estimate.fetchedAt;
}

/**
 * The tooltip on an abyssal module's value: what the estimate is and how old,
 * or why there is none. Undefined while the lookup is still out.
 */
export function abyssalValueHint(
  estimate: AbyssalEstimate | undefined,
  t: Translate,
  now: number = Date.now()
): string | undefined {
  switch (estimate?.status) {
    case undefined:
      return undefined;
    case 'priced':
      return `${t('market.mutamarket.estimateNote')} ${t('assets.abyssal.rowEstimatedAge', {
        age: formatAge(Math.max(0, now - estimatedAt(estimate)), t),
      })}`;
    case 'not-imported':
      return t('assets.abyssal.rowNotImported');
    case 'unavailable':
      return t('market.itemDetail.abyssal.estimate.unavailable');
    case 'unknown':
      return t('market.itemDetail.abyssal.estimate.unknown');
    case 'no-estimate':
      return t('market.itemDetail.abyssal.estimate.noEstimate');
  }
}
