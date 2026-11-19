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
    // Units already in running jobs for the market are on their way, so the alert says so too.
    body: fired(
      'stockBelowTarget',
      fire.inHangar > 0
        ? fire.inJobs > 0
          ? 'bodyHangarJobs'
          : 'bodyHangar'
        : fire.inJobs > 0
          ? 'bodyJobs'
          : 'body',
      {
        list: fire.listName,
        listed: formatNumber(fire.listed),
        target: formatNumber(fire.target),
        hangar: formatNumber(fire.inHangar),
        jobs: formatNumber(fire.inJobs),
        // Plural of the number the variant leads with.
        count: fire.inHangar > 0 ? fire.inHangar : fire.inJobs,
      }
    ),
  }),
  // The market's location id: the Stock tab opens that market (`?market=`); list ids are not numbers.
  subjectOf: (fire) => fire.locationId,
};
