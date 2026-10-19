import type { StockBelowTargetFire } from '@/engine/stockTargets/stockAlert';
import { type DomainCopy, type NoNames, fired } from './shared';

export const stockBelowTargetCopy: DomainCopy<StockBelowTargetFire, NoNames> = {
  // Per item on a list, like a price alert: the lists count every Character.
  poll: (fire) => ({
    title: fired('stockBelowTarget', fire.status === 'out' ? 'outTitle' : 'lowTitle', {
      item: fire.name,
    }),
    // Stock waiting in the hangar there is the quickest restock, so the alert says so.
    body: fired('stockBelowTarget', fire.inHangar > 0 ? 'bodyHangar' : 'body', {
      list: fire.listName,
      listed: fire.listed.toLocaleString(),
      target: fire.target.toLocaleString(),
      hangar: fire.inHangar.toLocaleString(),
      count: fire.inHangar,
    }),
  }),
  // The market's location id: the Stock tab opens that market (`?market=`); list ids are not numbers.
  subjectOf: (fire) => fire.locationId,
};
