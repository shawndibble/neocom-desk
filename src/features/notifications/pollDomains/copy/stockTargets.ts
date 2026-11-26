import type { StockBelowTargetFire } from '@/engine/stockTargets/stockAlert';
import { type DomainCopy, type NoNames, fired } from './shared';
import { formatNumber } from '@/lib/numberLocale';

export const stockBelowTargetCopy: DomainCopy<StockBelowTargetFire, NoNames> = {
  poll: (fire) => ({
    title: fired('stockBelowTarget', fire.status === 'out' ? 'outTitle' : 'lowTitle', {
      item: fire.name,
    }),
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
        count: fire.inHangar > 0 ? fire.inHangar : fire.inJobs,
      }
    ),
  }),
  subjectOf: (fire) => fire.locationId,
};
