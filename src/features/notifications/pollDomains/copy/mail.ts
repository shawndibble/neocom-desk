import type { MailNotificationFire } from '@/engine/notificationDiffs';
import i18n from '@/i18n';
import { newMailText } from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

export const mailCopy: DomainCopy<MailNotificationFire, NoNames> = {
  poll: (_fire, character) => newMailText((key, vars) => i18n.t(key, vars), {}, character),
};
