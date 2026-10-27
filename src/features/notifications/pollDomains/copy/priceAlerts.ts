import type { PriceAlertTriggeredFire } from '@/engine/notificationDiffs';
import i18n from '@/i18n';
import { priceAlertText } from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

export const priceAlertCopy: DomainCopy<PriceAlertTriggeredFire, NoNames> = {
  // Shared with the service worker, which renders a server-pushed alert (issue #5121).
  poll: (fire) => priceAlertText((key, vars) => i18n.t(key, vars), fire),
  // The item itself, selected via Market Browser's own `?type=` param.
  subjectOf: (fire) => fire.typeId,
};
