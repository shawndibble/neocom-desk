import type { MailNotificationFire } from '@/engine/notificationDiffs';
import i18n from '@/i18n';
import { newMailText } from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

// Shared with the service worker, which words a pushed new mail the same way
// (issue #5143). The poll's fire names no sender or subject, so this is the plain line.
export const mailCopy: DomainCopy<MailNotificationFire, NoNames> = {
  poll: (_fire, character) => newMailText((key, vars) => i18n.t(key, vars), {}, character),
};
