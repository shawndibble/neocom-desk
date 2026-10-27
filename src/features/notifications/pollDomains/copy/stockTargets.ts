import type { StockBelowTargetFire } from '@/engine/stockTargets/stockAlert';
import { type DomainCopy, type NoNames, fired } from './shared';
import { formatNumber } from '@/lib/numberLocale';

export const stockBelowTargetCopy: DomainCopy<StockBelowTargetFire, NoNames> = {
  // Per item on a list, like a price alert: the lists count every Character.
  poll: (fire) => ({
    title: fired('stockBelowTarget', fire.status === 'out' ? 'outTitle' : 'lowTitle', {
      item: fire.name,
    }),
    // Stock waiting in the hangar there is the quickest restock, so the alert says so.
    body: fired('stockBelowTarget', fire.inHangar > 0 ? 'bodyHangar' : 'body', {
      list: fire.listName,
      listed: formatNumber(fire.listed),
      target: formatNumber(fire.target),
      hangar: formatNumber(fire.inHangar),
      count: fire.inHangar,
    }),
  }),
  // The market's location id: the Stock tab opens that market (`?market=`); list ids are not numbers.
  subjectOf: (fire) => fire.locationId,
};
