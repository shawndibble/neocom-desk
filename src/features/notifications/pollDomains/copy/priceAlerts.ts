import type { PriceAlertTriggeredFire } from '@/engine/notificationDiffs';
import i18n from '@/i18n';
import { priceAlertText } from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

export const priceAlertCopy: DomainCopy<PriceAlertTriggeredFire, NoNames> = {
  poll: (fire) => priceAlertText((key, vars) => i18n.t(key, vars), fire),
  subjectOf: (fire) => fire.typeId,
};
