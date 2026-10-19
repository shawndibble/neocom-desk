import type { MailNotificationFire } from '@/engine/notificationDiffs';
import { type DomainCopy, type NoNames, simple } from './shared';

export const mailCopy: DomainCopy<MailNotificationFire, NoNames> = {
  poll: (_fire, character) => simple('newMail', { character }),
};
