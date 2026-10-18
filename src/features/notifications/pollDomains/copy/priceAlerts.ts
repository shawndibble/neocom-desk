import type { PriceAlertTriggeredFire } from '@/engine/notificationDiffs';
import { formatIsk } from '@/lib/isk';
import { type DomainCopy, type NoNames, fired } from './shared';

export const priceAlertCopy: DomainCopy<PriceAlertTriggeredFire, NoNames> = {
  // The only event with no Character in its copy: an alert is per item, not per pilot.
  poll: (fire) => ({
    title: fired('priceAlertTriggered', 'title'),
    body: fired('priceAlertTriggered', `${fire.direction}Body`, {
      item: fire.name,
      price: formatIsk(fire.price, 2),
      target: formatIsk(fire.targetPrice, 2),
    }),
  }),
  // The item itself, selected via Market Browser's own `?type=` param.
  subjectOf: (fire) => fire.typeId,
};
