/**
 * The app's EVE Notification renderer: `eveNotificationRender.ts` bound to the
 * app's i18n singleton. The service worker binds its own small instance
 * instead (`pushHandler.ts`), so this is the only module that imports `@/i18n`.
 */
import i18n from '@/i18n';
import { timeZoneFor, useTimeFormat } from '@/lib/timeFormat';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import {
  renderEveNotification,
  type EveNotificationNames,
  type EveNotificationTextCharacter,
} from './eveNotificationRender';

export {
  EVE_NOTIFICATION_RENDERED_TYPES,
  orbitalAggressorId,
  type EveNotificationNames,
  type EveNotificationTextCharacter,
} from './eveNotificationRender';

export function eveNotificationText(
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter,
  names: EveNotificationNames = {}
): { title: string; body: string } {
  // Read at render time, not subscribed: this is composed by the poller, outside
  // React, the way `pollDomains/calendar.ts` reads it. The renderer stays pure.
  return renderEveNotification(
    (key, options) => i18n.t(key, options),
    fire,
    character,
    names,
    timeZoneFor(useTimeFormat.getState().value)
  );
}
